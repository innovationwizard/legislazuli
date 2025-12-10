-- Enable Row Level Security (RLS) on Critical Tables
-- These tables contain "Ground Truth" data and prompt versions
-- Unauthorized access could poison the AI training data

-- 1. Enable RLS on all Critical Tables
ALTER TABLE golden_set_truths ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_evolution_queue ENABLE ROW LEVEL SECURITY;

-- 2. Create "Superuser Only" Policies
-- Using email='condor' as the superuser identifier (matches application logic)

-- ============================================
-- GOLDEN_SET_TRUTHS TABLE
-- ============================================
-- This table contains immutable "Ground Truth" snapshots
-- If poisoned, it destroys the mathematical proof of accuracy

-- POLICY: Only Superuser (condor) can READ the Truth
CREATE POLICY "Superuser can view golden truths"
ON golden_set_truths
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can INSERT the Truth
CREATE POLICY "Superuser can create golden truths"
ON golden_set_truths
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can UPDATE the Truth
CREATE POLICY "Superuser can update golden truths"
ON golden_set_truths
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can DELETE the Truth
CREATE POLICY "Superuser can delete golden truths"
ON golden_set_truths
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- ============================================
-- PROMPT_VERSIONS TABLE
-- ============================================
-- This table contains versioned prompts used for AI extraction
-- Unauthorized modification could degrade extraction accuracy

-- POLICY: Authenticated users can VIEW prompt versions (for transparency)
CREATE POLICY "Authenticated users can view prompt versions"
ON prompt_versions
FOR SELECT
USING (auth.role() = 'authenticated');

-- POLICY: Only Superuser (condor) can CREATE prompt versions
CREATE POLICY "Superuser can create prompt versions"
ON prompt_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can UPDATE prompt versions
CREATE POLICY "Superuser can update prompt versions"
ON prompt_versions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can DELETE prompt versions
CREATE POLICY "Superuser can delete prompt versions"
ON prompt_versions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- ============================================
-- PROMPT_EVOLUTION_QUEUE TABLE
-- ============================================
-- This table tracks feedback accumulation for prompt evolution
-- Unauthorized modification could trigger incorrect prompt changes

-- POLICY: Only Superuser (condor) can VIEW evolution queue
CREATE POLICY "Superuser can view evolution queue"
ON prompt_evolution_queue
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- POLICY: Only Superuser (condor) can MODIFY evolution queue
CREATE POLICY "Superuser can manage evolution queue"
ON prompt_evolution_queue
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.email = 'condor'
  )
);

-- ============================================
-- IMPORTANT: AUTHENTICATION SETUP
-- ============================================
-- This application uses NextAuth.js for authentication, not Supabase Auth.
-- These RLS policies use Supabase's auth.uid() which requires Supabase Auth.
--
-- OPTION 1: Use Supabase Auth (Recommended for RLS)
--   1. Enable Supabase Auth in your project
--   2. Create users in Supabase Auth (not just in users table)
--   3. Use Supabase client with auth tokens in API routes
--   4. These policies will work as-is
--
-- OPTION 2: Bypass RLS (Current Setup)
--   If you continue using NextAuth.js only:
--   1. API routes already check session.user.email === 'condor'
--   2. Use SUPABASE_SERVICE_ROLE_KEY in createServerClient()
--   3. Service role key bypasses RLS
--   4. RLS policies won't be enforced, but API-level checks still protect
--
-- OPTION 3: Hybrid Approach
--   1. Keep NextAuth for UI authentication
--   2. Create Supabase Auth users for each NextAuth user
--   3. Map NextAuth sessions to Supabase Auth tokens
--   4. Use Supabase Auth tokens in database queries
--
-- ============================================
-- NOTES
-- ============================================
-- 1. These policies use email='condor' to identify the superuser
--    This matches the application logic in API routes
--
-- 2. For production, consider:
--    - Adding a 'role' column to users table for more flexibility
--    - Migrating to Supabase Auth for better RLS integration
--    - Enabling Point-in-Time Recovery (PITR) on your Supabase database
--
-- 3. To test these policies (if using Supabase Auth):
--    - Try accessing these tables as a non-condor user (should fail)
--    - Verify condor user can access all operations
--
-- 4. IMPORTANT: Enable PITR (Point-in-Time Recovery) in Supabase Dashboard
--    - Settings > Database > Point-in-Time Recovery
--    - This protects against authorized mistakes (accidental deletion)
--    - RLS prevents unauthorized access; PITR saves you from authorized mistakes
--
-- 5. CURRENT STATUS:
--    - API routes use NextAuth sessions for authorization
--    - Service role key bypasses RLS (if using createServerClient with service role)
--    - These RLS policies provide defense-in-depth if you migrate to Supabase Auth

