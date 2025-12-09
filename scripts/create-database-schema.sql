-- Script SQL para crear todas las tablas necesarias en Supabase
-- Ejecutar esto en el SQL Editor de Supabase ANTES de insertar usuarios

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos subidos
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  detected_document_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracciones
CREATE TABLE IF NOT EXISTS extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  claude_result JSONB,
  gemini_result JSONB,
  consensus_result JSONB,
  confidence TEXT,
  discrepancies JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campos extraídos
CREATE TABLE IF NOT EXISTS extracted_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_value_words TEXT,
  field_order INT,
  needs_review BOOLEAN DEFAULT FALSE
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_fields_extraction_id ON extracted_fields(extraction_id);

-- Nota: La autorización se maneja en las API routes de Next.js usando NextAuth
-- Por lo tanto, RLS puede estar deshabilitado o configurado para permitir todo
-- ya que las API routes verifican la autenticación antes de acceder a los datos

