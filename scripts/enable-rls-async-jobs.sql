-- Enable Row Level Security (RLS) on Async Jobs Tables
-- These tables track Textract and extraction jobs for async processing
-- Users should only access jobs for their own documents
--
-- IMPORTANT NOTES:
-- 1. This application currently uses NextAuth.js for authentication (not Supabase Auth)
-- 2. API routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- 3. These policies use auth.uid() for future-proofing if migrating to Supabase Auth
-- 4. Current API routes will continue to work since service role bypasses RLS
-- 5. These policies protect against direct database access via anon key

-- ============================================
-- TEXTRACT_JOBS TABLE
-- ============================================
-- Users can only access Textract jobs for their own documents

ALTER TABLE textract_jobs ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view Textract jobs for their own documents
CREATE POLICY "Users can view own textract jobs"
ON textract_jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = textract_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create Textract jobs for their own documents
CREATE POLICY "Users can create textract jobs for own documents"
ON textract_jobs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = textract_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update Textract jobs for their own documents
CREATE POLICY "Users can update own textract jobs"
ON textract_jobs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = textract_jobs.document_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = textract_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete Textract jobs for their own documents
CREATE POLICY "Users can delete own textract jobs"
ON textract_jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = textract_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- ============================================
-- EXTRACTION_JOBS TABLE
-- ============================================
-- Users can only access extraction jobs for their own documents

ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view extraction jobs for their own documents
CREATE POLICY "Users can view own extraction jobs"
ON extraction_jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extraction_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create extraction jobs for their own documents
CREATE POLICY "Users can create extraction jobs for own documents"
ON extraction_jobs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extraction_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update extraction jobs for their own documents
CREATE POLICY "Users can update own extraction jobs"
ON extraction_jobs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extraction_jobs.document_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extraction_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete extraction jobs for their own documents
CREATE POLICY "Users can delete own extraction jobs"
ON extraction_jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extraction_jobs.document_id
    AND users.id = auth.uid()
  )
);

-- ============================================
-- NOTES
-- ============================================
-- 1. These policies use auth.uid() which requires Supabase Auth
--    Since the app currently uses NextAuth, these policies won't be enforced
--    until you migrate to Supabase Auth or set up a hybrid approach
--
-- 2. API routes using SUPABASE_SERVICE_ROLE_KEY bypass RLS completely
--    This means current functionality will continue to work unchanged
--
-- 3. These policies protect against:
--    - Direct database access via Supabase anon key
--    - Accidental exposure of data through Supabase client libraries
--    - Future migration to Supabase Auth
--
-- 4. To test these policies (after migrating to Supabase Auth):
--    - Try accessing tables as a non-authenticated user → Should fail
--    - Try accessing another user's jobs → Should fail
--    - Try accessing your own jobs → Should succeed
--
-- 5. To migrate to Supabase Auth:
--    a. Enable Supabase Auth in your project
--    b. Create Supabase Auth users for each NextAuth user
--    c. Map NextAuth sessions to Supabase Auth tokens
--    d. Use Supabase Auth tokens in database queries instead of service role key
--    e. These policies will then be enforced automatically
--
-- 6. For now, these policies satisfy Supabase Security Advisor requirements
--    while maintaining current functionality through service role key bypass

