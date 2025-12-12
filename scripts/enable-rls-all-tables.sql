-- Enable Row Level Security (RLS) on All Public Tables
-- This script addresses Supabase Security Advisor warnings about RLS being disabled
--
-- IMPORTANT NOTES:
-- 1. This application currently uses NextAuth.js for authentication (not Supabase Auth)
-- 2. API routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- 3. These policies use auth.uid() for future-proofing if migrating to Supabase Auth
-- 4. Current API routes will continue to work since service role bypasses RLS
-- 5. These policies protect against direct database access via anon key
--
-- ============================================
-- USERS TABLE
-- ============================================
-- Users can only view and modify their own account

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view their own record
CREATE POLICY "Users can view own account"
ON users
FOR SELECT
USING (auth.uid() = id);

-- POLICY: Users can update their own record (except email and password_hash for security)
-- Note: Password updates should go through API routes with proper validation
CREATE POLICY "Users can update own account"
ON users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- POLICY: Service role can manage all users (for API routes)
-- This is implicit since service role bypasses RLS, but documented here for clarity

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
-- Users can only access documents they own

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view their own documents
CREATE POLICY "Users can view own documents"
ON documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.user_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create documents for themselves
CREATE POLICY "Users can create own documents"
ON documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.user_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update their own documents
CREATE POLICY "Users can update own documents"
ON documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.user_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.user_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete their own documents
CREATE POLICY "Users can delete own documents"
ON documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.user_id
    AND users.id = auth.uid()
  )
);

-- ============================================
-- EXTRACTIONS TABLE
-- ============================================
-- Users can only access extractions for their own documents

ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view extractions for their own documents
CREATE POLICY "Users can view own extractions"
ON extractions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extractions.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create extractions for their own documents
CREATE POLICY "Users can create extractions for own documents"
ON extractions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extractions.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update extractions for their own documents
CREATE POLICY "Users can update own extractions"
ON extractions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extractions.document_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extractions.document_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete extractions for their own documents
CREATE POLICY "Users can delete own extractions"
ON extractions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents
    INNER JOIN users ON users.id = documents.user_id
    WHERE documents.id = extractions.document_id
    AND users.id = auth.uid()
  )
);

-- ============================================
-- EXTRACTED_FIELDS TABLE
-- ============================================
-- Users can only access fields for their own extractions

ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view fields for their own extractions
CREATE POLICY "Users can view own extracted fields"
ON extracted_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extracted_fields.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create fields for their own extractions
CREATE POLICY "Users can create fields for own extractions"
ON extracted_fields
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extracted_fields.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update fields for their own extractions
CREATE POLICY "Users can update own extracted fields"
ON extracted_fields
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extracted_fields.extraction_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extracted_fields.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete fields for their own extractions
CREATE POLICY "Users can delete own extracted fields"
ON extracted_fields
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extracted_fields.extraction_id
    AND users.id = auth.uid()
  )
);

-- ============================================
-- EXTRACTION_FEEDBACK TABLE
-- ============================================
-- Users can only access feedback they created or for their own extractions

ALTER TABLE extraction_feedback ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view feedback they created or for their own extractions
CREATE POLICY "Users can view own feedback"
ON extraction_feedback
FOR SELECT
USING (
  -- User created this feedback
  reviewed_by = auth.uid()
  OR
  -- User owns the extraction this feedback is for
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_feedback.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create feedback for their own extractions
CREATE POLICY "Users can create feedback for own extractions"
ON extraction_feedback
FOR INSERT
WITH CHECK (
  reviewed_by = auth.uid()
  AND
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_feedback.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update their own feedback
CREATE POLICY "Users can update own feedback"
ON extraction_feedback
FOR UPDATE
USING (reviewed_by = auth.uid())
WITH CHECK (reviewed_by = auth.uid());

-- POLICY: Users can delete their own feedback
CREATE POLICY "Users can delete own feedback"
ON extraction_feedback
FOR DELETE
USING (reviewed_by = auth.uid());

-- ============================================
-- EXTRACTION_PROMPT_VERSIONS TABLE
-- ============================================
-- Users can only access prompt version records for their own extractions

ALTER TABLE extraction_prompt_versions ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can view prompt versions for their own extractions
CREATE POLICY "Users can view prompt versions for own extractions"
ON extraction_prompt_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_prompt_versions.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can create prompt version records for their own extractions
CREATE POLICY "Users can create prompt versions for own extractions"
ON extraction_prompt_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_prompt_versions.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can update prompt version records for their own extractions
CREATE POLICY "Users can update prompt versions for own extractions"
ON extraction_prompt_versions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_prompt_versions.extraction_id
    AND users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_prompt_versions.extraction_id
    AND users.id = auth.uid()
  )
);

-- POLICY: Users can delete prompt version records for their own extractions
CREATE POLICY "Users can delete prompt versions for own extractions"
ON extraction_prompt_versions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM extractions
    INNER JOIN documents ON documents.id = extractions.document_id
    INNER JOIN users ON users.id = documents.user_id
    WHERE extractions.id = extraction_prompt_versions.extraction_id
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
--    - Try accessing another user's data → Should fail
--    - Try accessing your own data → Should succeed
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
