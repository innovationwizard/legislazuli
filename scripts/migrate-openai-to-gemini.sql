-- Migration: Rename openai_result to gemini_result
-- This migration updates the database schema to reflect the switch from OpenAI to Google Gemini
-- Run this in the Supabase SQL Editor

-- Rename the column in the extractions table
ALTER TABLE extractions 
  RENAME COLUMN openai_result TO gemini_result;

-- Update any indexes or constraints if they reference the old column name
-- (PostgreSQL automatically updates indexes when columns are renamed)

-- Verify the change
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'extractions' AND column_name IN ('claude_result', 'gemini_result');

