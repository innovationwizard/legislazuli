-- Add performance metrics columns to prompt_versions table for the Leaderboard
-- These track Golden Set test results and regression counts

ALTER TABLE prompt_versions 
ADD COLUMN IF NOT EXISTS golden_set_accuracy NUMERIC(5,4), -- e.g. 0.9850 (98.50%)
ADD COLUMN IF NOT EXISTS golden_set_run_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS regression_count INT DEFAULT 0, -- How many fields got WORSE in Golden Set test
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'; -- 'active', 'pending', 'rejected', 'deprecated'

-- Update existing records to have status
UPDATE prompt_versions 
SET status = CASE 
  WHEN is_active = TRUE THEN 'active'
  ELSE 'pending'
END
WHERE status = 'pending' OR status IS NULL;

-- Create index for faster leaderboard queries
CREATE INDEX IF NOT EXISTS idx_prompt_versions_status ON prompt_versions(doc_type, model, status);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_accuracy ON prompt_versions(doc_type, model, golden_set_accuracy DESC NULLS LAST);

-- Add comment explaining the columns
COMMENT ON COLUMN prompt_versions.golden_set_accuracy IS 
'Accuracy score from Golden Set regression testing (0.0000 to 1.0000). 
Higher is better. Only set after Golden Set test completes.';

COMMENT ON COLUMN prompt_versions.regression_count IS 
'Number of fields that performed WORSE than the previous version in Golden Set test. 
Lower is better. Used to detect regressions.';

COMMENT ON COLUMN prompt_versions.status IS 
'Status of the prompt version: active (currently in use), pending (waiting for testing), 
rejected (failed Golden Set test), deprecated (replaced by newer version).';

