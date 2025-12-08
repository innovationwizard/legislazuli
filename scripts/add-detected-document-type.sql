-- Migration script to add detected_document_type field to documents table
-- Execute this in the SQL Editor of Supabase

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS detected_document_type TEXT;

-- Add a comment to explain the field
COMMENT ON COLUMN documents.detected_document_type IS 'Tipo de documento detectado automáticamente por IA cuando doc_type es "otros"';

