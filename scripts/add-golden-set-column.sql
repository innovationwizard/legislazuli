-- Migration: Add is_golden_set column to documents table
-- This marks documents that are part of the "Golden Set" for regression testing
-- The Golden Set should contain:
-- - 5 pristine, perfect PDFs
-- - 5 rotated/scanned images (that work correctly)
-- - 5 complex edge cases (previously solved)

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS is_golden_set BOOLEAN DEFAULT FALSE;

-- Create index for faster golden set queries
CREATE INDEX IF NOT EXISTS idx_documents_golden_set 
ON documents(is_golden_set) 
WHERE is_golden_set = TRUE;

-- Add comment explaining the column
COMMENT ON COLUMN documents.is_golden_set IS 
'Mark documents as part of the Golden Set for regression testing. These documents represent the "Perfect Range" of inputs and are used to prevent prompt drift during ML evolution.';

