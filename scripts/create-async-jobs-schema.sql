-- Schema for Enterprise Async Architecture
-- Supports S3 + Textract async processing for large PDFs

-- Textract async jobs tracking
CREATE TABLE IF NOT EXISTS textract_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  job_id TEXT UNIQUE NOT NULL, -- AWS Textract JobId
  s3_bucket TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, SUCCEEDED, FAILED
  status_message TEXT,
  textract_response JSONB, -- Full Textract response when complete
  extracted_text TEXT, -- Extracted text from Textract
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extraction jobs (tracks full extraction pipeline including LLM processing)
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  textract_job_id UUID REFERENCES textract_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING_TEXTTRACT, PROCESSING_LLM, COMPLETED, FAILED
  status_message TEXT,
  extraction_id UUID REFERENCES extractions(id) ON DELETE SET NULL, -- Final extraction result
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_textract_jobs_document_id ON textract_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_textract_jobs_job_id ON textract_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_textract_jobs_status ON textract_jobs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_document_id ON extraction_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_textract_job_id ON extraction_jobs(textract_job_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_extraction_jobs_updated_at
  BEFORE UPDATE ON extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

