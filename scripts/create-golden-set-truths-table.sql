-- Create golden_set_truths table to store immutable snapshots of verified extraction results
-- This prevents "truth drift" - the baseline values are frozen when added to Golden Set

CREATE TABLE IF NOT EXISTS golden_set_truths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  verified_result JSONB NOT NULL, -- The "truth" snapshot (consensus_result at time of promotion)
  verified_fields JSONB, -- Individual field values for easier comparison
  verified_by UUID REFERENCES users(id), -- User who verified (condor)
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT, -- Optional notes about why this is the truth
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_golden_set_truths_document_id ON golden_set_truths(document_id);

-- Add column to documents table for tracking promotion timestamp
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS golden_set_promoted_at TIMESTAMPTZ;

-- Create function for atomic promotion to Golden Set
-- SECURITY: Set search_path to empty string to prevent search_path manipulation attacks
CREATE OR REPLACE FUNCTION promote_to_golden_set(
  doc_id UUID, 
  truth_json JSONB,
  verified_by_uuid UUID,
  notes_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- 1. Flag the document as Golden Set
  UPDATE public.documents 
  SET is_golden_set = TRUE, 
      golden_set_promoted_at = pg_catalog.now() 
  WHERE id = doc_id;

  -- 2. Store the immutable truth snapshot
  INSERT INTO public.golden_set_truths (
    document_id, 
    verified_result,
    verified_by,
    notes
  )
  VALUES (doc_id, truth_json, verified_by_uuid, notes_text)
  ON CONFLICT (document_id) 
  DO UPDATE SET 
    verified_result = EXCLUDED.verified_result,
    verified_by = EXCLUDED.verified_by,
    notes = EXCLUDED.notes,
    verified_at = pg_catalog.now();

END;
$$;

-- Add comment explaining the table
COMMENT ON TABLE golden_set_truths IS 
'Stores immutable snapshots of verified extraction results for Golden Set documents. 
These snapshots serve as the "ground truth" for regression testing. 
The verified_result is frozen at the time of promotion and should not change.';

