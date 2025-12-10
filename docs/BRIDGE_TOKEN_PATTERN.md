# The Bridge Token Pattern: Hardening RLS Without Ripping Out NextAuth

## Problem Statement

The current architecture uses:
- **NextAuth.js** for authentication (session management)
- **Supabase Service Role Key** for database access (bypasses RLS)
- **API route checks** (`session.user.email === 'condor'`) for authorization

This creates a "Hard Shell, Soft Center" security model:
- ✅ **Hard Shell**: Application-level authorization checks
- ⚠️ **Soft Center**: Database access bypasses RLS (service role key)

## The Solution: Bridge Token Pattern

To activate RLS policies without migrating away from NextAuth, we create a utility that "downgrades" the Service Client into a User Client on the fly.

### Concept

1. **Verify the NextAuth Session** (already done in API routes)
2. **Mint a custom JWT** signed with Supabase's `JWT_SECRET`
3. **Initialize a new Supabase Client** using that JWT (not the Service Key)
4. **The Database now sees `auth.uid()`** and enforces RLS policies

## Implementation (Reference for Future Hardening)

### Step 1: Install Dependencies

```bash
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

### Step 2: Create Bridge Token Utility

**File: `lib/db/supabase-bridge.ts`**

```typescript
import jwt from "jsonwebtoken";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a scoped Supabase client that respects RLS policies
 * by minting a custom JWT token from NextAuth session
 * 
 * @param userEmail - Email from NextAuth session
 * @param userId - Optional UUID from users table (if available)
 * @returns Supabase client that will be subject to RLS policies
 */
export function getScopedSupabaseClient(
  userEmail: string,
  userId?: string
): SupabaseClient {
  if (!process.env.SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET is required for Bridge Token pattern');
  }

  // 1. Create a custom payload that matches Supabase's expectations
  const payload = {
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiration
    sub: userId || userEmail, // Use UUID if available, otherwise email
    role: "authenticated",
    email: userEmail,
    app_metadata: {
      provider: "nextauth",
      // Pass role claim to RLS policies
      role: userEmail === 'condor' ? 'superuser' : 'user'
    },
    user_metadata: {
      email: userEmail
    }
  };

  // 2. Sign with the SUPABASE JWT Secret (Not the Service Key!)
  const token = jwt.sign(payload, process.env.SUPABASE_JWT_SECRET, {
    algorithm: 'HS256'
  });

  // 3. Return a client restricted by this token
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      auth: {
        persistSession: false, // Don't persist, this is server-side only
        autoRefreshToken: false
      }
    }
  );
}

/**
 * Helper to get user UUID from email (for better RLS integration)
 */
export async function getUserUuidFromEmail(email: string): Promise<string | null> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await serviceClient
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}
```

### Step 3: Update API Routes to Use Bridge Token

**Example: `app/api/golden-set/route.ts`**

```typescript
import { getScopedSupabaseClient, getUserUuidFromEmail } from '@/lib/db/supabase-bridge';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can access
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get user UUID for better RLS integration
    const userId = await getUserUuidFromEmail(session.user.email!);
    
    // Use scoped client instead of service role client
    const supabase = getScopedSupabaseClient(session.user.email!, userId || undefined);

    // Now RLS policies will be enforced!
    const { data, error } = await supabase
      .from('golden_set_truths')
      .insert({ ... });

    // Rest of the code...
  }
}
```

### Step 4: Update RLS Policies to Use app_metadata

**File: `scripts/enable-rls-critical-tables.sql` (Updated)**

```sql
-- Updated policy to check app_metadata.role
CREATE POLICY "Superuser can view golden truths"
ON golden_set_truths
FOR SELECT
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'superuser'
  OR
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);
```

### Step 5: Environment Variables

Add to `.env.local`:

```bash
# Supabase JWT Secret (found in Supabase Dashboard > Settings > API > JWT Secret)
SUPABASE_JWT_SECRET=your-jwt-secret-here
```

## Benefits

1. **Defense in Depth**: Even if API route logic is bypassed, RLS policies protect the database
2. **No Migration Required**: Keep NextAuth.js, just add a bridge layer
3. **Gradual Rollout**: Can be implemented route-by-route
4. **Audit Trail**: Database logs show which user performed each operation

## Trade-offs

1. **Performance**: Additional JWT signing overhead (minimal)
2. **Complexity**: More moving parts in authentication flow
3. **Maintenance**: Need to keep JWT secret in sync with Supabase

## Migration Strategy

1. **Phase 1**: Implement bridge token utility (non-breaking)
2. **Phase 2**: Update critical routes one-by-one:
   - Start with `golden_set_truths` operations
   - Then `prompt_versions` operations
   - Finally `prompt_evolution_queue` operations
3. **Phase 3**: Test thoroughly with non-condor users
4. **Phase 4**: Remove service role key usage from updated routes

## Testing

1. **As non-condor user**:
   - Attempt to access protected tables → Should fail with RLS error
   - Verify error message is clear

2. **As condor user**:
   - All operations should succeed
   - Verify RLS policies are actually enforced (check Supabase logs)

3. **Edge cases**:
   - Expired tokens
   - Invalid JWT secret
   - Missing user in users table

## Principal Note

**Defense in Depth**: Currently, you are relying on a "Hard Shell" (App Checks) with a "Soft Center" (DB Access). The Bridge Token pattern hardens the center. If you implement this, even if someone bypasses your API route logic, the Database itself will reject their query because they lack a valid signed token.

## Next Steps

Your backend is essentially Feature Complete and secured with basic strictures. The RLS policies are ready to be activated whenever you decide to implement the Bridge Token pattern.

**Priority**: Medium (Optional Hardening)
**Effort**: 2-4 hours
**Risk**: Low (can be rolled out gradually)

