-- Add soft delete support to extractions table
-- Run this in Supabase SQL Editor

-- Add deleted_at column to extractions table
ALTER TABLE extractions 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for filtering non-deleted records
CREATE INDEX IF NOT EXISTS idx_extractions_deleted_at ON extractions(deleted_at) WHERE deleted_at IS NULL;

