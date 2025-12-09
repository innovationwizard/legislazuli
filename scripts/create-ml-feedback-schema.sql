-- ML Feedback System Schema
-- Stores feedback on field-level extraction accuracy

CREATE TABLE IF NOT EXISTS extraction_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('claude', 'openai')),
  is_correct BOOLEAN NOT NULL,
  why TEXT, -- 100 char explanation when incorrect
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_extraction_id ON extraction_feedback(extraction_id);
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_model ON extraction_feedback(model);
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_reviewed_by ON extraction_feedback(reviewed_by);

-- Stores versioned prompts with performance metrics
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('patente_empresa', 'patente_sociedad')),
  model TEXT NOT NULL CHECK (model IN ('claude', 'openai')),
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('system', 'user')),
  version_number INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  parent_version_id UUID,
  
  -- Performance metrics (calculated via backtesting)
  accuracy_score DECIMAL(5,4), -- 0.0000 to 1.0000
  total_fields_tested INTEGER DEFAULT 0,
  correct_fields INTEGER DEFAULT 0,
  
  -- Evolution metadata
  evolution_reason TEXT, -- Aggregated WHY reasons that triggered this version
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT FALSE, -- Only one active version per doc_type+model+prompt_type
  
  FOREIGN KEY (parent_version_id) REFERENCES prompt_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(doc_type, model, prompt_type, version_number)
);

-- Index for active prompts lookup
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(doc_type, model, prompt_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_versions_doc_model ON prompt_versions(doc_type, model);

-- Tracks which prompt version was used for each extraction
CREATE TABLE IF NOT EXISTS extraction_prompt_versions (
  extraction_id UUID NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('claude', 'openai')),
  system_prompt_version_id UUID NOT NULL,
  user_prompt_version_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (extraction_id, model),
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE,
  FOREIGN KEY (system_prompt_version_id) REFERENCES prompt_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_prompt_version_id) REFERENCES prompt_versions(id) ON DELETE RESTRICT
);

-- Tracks prompt evolution feedback accumulation
CREATE TABLE IF NOT EXISTS prompt_evolution_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('patente_empresa', 'patente_sociedad')),
  model TEXT NOT NULL CHECK (model IN ('claude', 'openai')),
  feedback_count INTEGER DEFAULT 0,
  error_categories JSONB DEFAULT '{}'::jsonb,
  should_evolve BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(doc_type, model)
);

-- Index for evolution queue lookups
CREATE INDEX IF NOT EXISTS idx_evolution_queue_should_evolve ON prompt_evolution_queue(should_evolve) WHERE should_evolve = true;

