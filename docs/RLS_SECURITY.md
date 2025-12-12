# Row Level Security (RLS) for All Tables

## Overview

This document describes the Row Level Security (RLS) policies implemented to protect all database tables from unauthorized access. This addresses Supabase Security Advisor warnings about RLS being disabled on public tables.

## Protected Tables

### Public Tables (User Data)

The following tables have RLS enabled to ensure users can only access their own data:

#### 1. `users`
**Purpose**: User accounts and authentication data.

**Policies**:
- **SELECT**: Users can view their own account
- **UPDATE**: Users can update their own account
- **INSERT/DELETE**: Handled through API routes with proper authorization

#### 2. `documents`
**Purpose**: Documents uploaded by users.

**Policies**:
- **SELECT/INSERT/UPDATE/DELETE**: Users can only access documents they own (via `user_id`)

#### 3. `extractions`
**Purpose**: Extraction results for user documents.

**Policies**:
- **SELECT/INSERT/UPDATE/DELETE**: Users can only access extractions for their own documents (via `document_id` → `documents.user_id`)

#### 4. `extracted_fields`
**Purpose**: Individual fields extracted from documents.

**Policies**:
- **SELECT/INSERT/UPDATE/DELETE**: Users can only access fields for their own extractions (via `extraction_id` → `extractions.document_id` → `documents.user_id`)

#### 5. `extraction_feedback`
**Purpose**: Field-level feedback on extraction accuracy.

**Policies**:
- **SELECT**: Users can view feedback they created or feedback for their own extractions
- **INSERT**: Users can create feedback for their own extractions
- **UPDATE/DELETE**: Users can only modify their own feedback

#### 6. `extraction_prompt_versions`
**Purpose**: Tracks which prompt versions were used for each extraction.

**Policies**:
- **SELECT/INSERT/UPDATE/DELETE**: Users can only access prompt version records for their own extractions

**Implementation**: Execute `scripts/enable-rls-all-tables.sql` in Supabase SQL Editor.

### Critical Tables (AI Training Data)

#### 1. `golden_set_truths`
**Purpose**: Immutable snapshots of verified extraction results for Golden Set documents.

**Risk**: If poisoned, destroys the mathematical proof of "100% Accuracy" claims and corrupts regression testing.

**Policies**:
- **SELECT**: Only superuser (condor) can view
- **INSERT**: Only superuser (condor) can create
- **UPDATE**: Only superuser (condor) can modify
- **DELETE**: Only superuser (condor) can delete

#### 2. `prompt_versions`
**Purpose**: Versioned prompts used for AI extraction with performance metrics.

**Risk**: Unauthorized modification could degrade extraction accuracy or poison the prompt evolution system.

**Policies**:
- **SELECT**: All authenticated users can view (for transparency)
- **INSERT/UPDATE/DELETE**: Only superuser (condor) can modify

#### 3. `prompt_evolution_queue`
**Purpose**: Tracks feedback accumulation that triggers prompt evolution.

**Risk**: Unauthorized modification could trigger incorrect prompt changes.

**Policies**:
- **ALL**: Only superuser (condor) can access

## Superuser Identification

The system uses `email = 'condor'` to identify the superuser. This matches the application logic in API routes:

```typescript
if (session.user.email !== 'condor') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

## Implementation

Execute the SQL scripts in Supabase SQL Editor in order:

1. **For public tables** (users, documents, extractions, etc.):
   ```bash
   scripts/enable-rls-all-tables.sql
   ```

2. **For critical AI training tables**:
   ```bash
   scripts/enable-rls-critical-tables.sql
   ```

## Current Architecture Notes

### NextAuth.js + Service Role Key

This application currently uses:
- **NextAuth.js** for user authentication (not Supabase Auth)
- **SUPABASE_SERVICE_ROLE_KEY** in API routes (bypasses RLS)

**Important**: The RLS policies use `auth.uid()` which requires Supabase Auth. Since the app uses NextAuth:
- ✅ **RLS is enabled** (satisfies Security Advisor requirements)
- ✅ **Current functionality works** (service role bypasses RLS)
- ✅ **Direct database access is protected** (anon key queries are blocked)
- ⚠️ **Policies won't be enforced** until migrating to Supabase Auth

### Migration Path to Supabase Auth

To fully enforce RLS policies:

1. Enable Supabase Auth in your project
2. Create Supabase Auth users for each NextAuth user
3. Map NextAuth sessions to Supabase Auth tokens
4. Use Supabase Auth tokens in database queries instead of service role key
5. RLS policies will then be automatically enforced

Until then, API routes continue to enforce authorization through NextAuth session checks.

## Testing

1. **As non-condor user**:
   - Attempt to SELECT from `golden_set_truths` → Should fail
   - Attempt to INSERT into `prompt_versions` → Should fail
   - Attempt to SELECT from `prompt_versions` → Should succeed (read-only)

2. **As condor user**:
   - All operations should succeed

## Additional Security Recommendations

### 1. Point-in-Time Recovery (PITR)
**Critical**: Enable PITR in Supabase Dashboard immediately.

- **Location**: Settings > Database > Point-in-Time Recovery
- **Why**: RLS prevents unauthorized access; PITR saves you from authorized mistakes
- **Scenario**: If a tired intern accidentally deletes `golden_set_truths`, PITR allows recovery

### 2. Database Backups
- Enable automated daily backups
- Store backups in separate location (S3, etc.)
- Test restore procedures regularly

### 3. Audit Logging
Consider adding audit logs for:
- All writes to `golden_set_truths`
- All modifications to `prompt_versions`
- All changes to active prompts

### 4. Future Enhancements
- Add `role` column to `users` table for more flexible permissions
- Implement role-based access control (RBAC)
- Add IP whitelisting for superuser operations
- Implement two-factor authentication (2FA) for superuser accounts

## The "Poisoned Well" Risk

In AI architectures, the "Ground Truth" database is more valuable than the code itself. If a malicious actor (or a tired intern) deletes your `golden_set_truths`, you lose:

1. The mathematical proof of your "100% Accuracy" claim
2. The ability to perform regression testing
3. The baseline for detecting "Catastrophic Forgetting"
4. Trust in your entire AI system

**RLS + PITR = Defense in Depth**

- **RLS**: Prevents unauthorized access
- **PITR**: Saves you from authorized mistakes

## Monitoring

Monitor for:
- Failed RLS policy violations (unauthorized access attempts)
- Unusual patterns in `golden_set_truths` modifications
- Rapid changes to active prompt versions
- Large deletions from critical tables

## Rollback Plan

If RLS policies cause issues:

1. Temporarily disable RLS:
   ```sql
   ALTER TABLE golden_set_truths DISABLE ROW LEVEL SECURITY;
   ```

2. Fix the policy issue

3. Re-enable RLS:
   ```sql
   ALTER TABLE golden_set_truths ENABLE ROW LEVEL SECURITY;
   ```

**Note**: Only do this in emergency situations. Always re-enable RLS as soon as possible.

