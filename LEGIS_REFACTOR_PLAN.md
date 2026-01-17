# Legislazuli: Intelligent Legal Document System - Refactor Plan

## Executive Summary

This refactoring plan transforms Legislazuli from a **document extraction tool** into a **fully autonomous legal document processing and generation system** that learns continuously from user behavior. The system implements a **multi-layer learning architecture** (inspired by the Latina Interiors learning system) combining:

- **Fast Learning (Phase 1)**: Bayesian optimization + GPT-4 rule evolution for document classification, extraction filtering, and template generation
- **Slow Learning (Phase 2)**: Deep neural networks for quality prediction and anomaly detection
- **CRM Integration**: Persistent client context with relationship mapping and data freshness tracking
- **Autonomous Document Generation**: Full legal document drafting, formatting, and template management

**Primary Goal**: Minimize user effort to near-zero while maintaining 100% data accuracy.

**Current State**: User selects doc type → uploads → reviews extraction → copies data → manual document creation
**Target State**: User uploads → AI handles everything → user approves final document (5-second workflow)

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Refactoring Objectives](#2-refactoring-objectives)
3. [New System Architecture](#3-new-system-architecture)
4. [Feature 1: Zero-Touch Document Type Detection](#4-feature-1-zero-touch-document-type-detection)
5. [Feature 2: Intelligent CRM System](#5-feature-2-intelligent-crm-system)
6. [Feature 3: Smart Extraction Filtering](#6-feature-3-smart-extraction-filtering)
7. [Feature 4: Autonomous Document Generation](#7-feature-4-autonomous-document-generation)
8. [Multi-Layer Learning System](#8-multi-layer-learning-system)
9. [Database Schema Changes](#9-database-schema-changes)
10. [API Endpoint Changes](#10-api-endpoint-changes)
11. [Frontend Changes](#11-frontend-changes)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Success Metrics](#13-success-metrics)
14. [Risk Analysis](#14-risk-analysis)

---

## 1. Current Architecture Analysis

### 1.1 Current Workflow Pain Points

| Pain Point | User Impact | Time Wasted | Automation Potential |
|-----------|-------------|-------------|---------------------|
| Manual doc type selection | 5-10 seconds per upload | 2-5 min/day | 100% - AI can classify |
| No client context persistence | Re-entering client data | 10-20 min/day | 100% - CRM solves this |
| Extraction includes noise (headers/footers) | Manual filtering required | 5-10 min/document | 95% - AI can learn clean zones |
| Manual document creation | Retyping extracted data | 30-60 min/document | 90% - Template-based generation |
| No template management | Searching for formats | 10-15 min/document | 100% - Database + AI retrieval |

**Total Time Wasted**: ~60-90 minutes per document
**Target Reduction**: 95% (down to 3-5 minutes for approval/review)

### 1.2 Current Learning System Maturity

**Extraction Accuracy**:
- Dual-model consensus (Claude + Gemini) achieves ~95% field accuracy
- Golden Set testing prevents regression
- Prompt evolution improves over time

**What's Missing**:
- No learning for document classification
- No learning for extraction filtering (noise removal)
- No learning for template selection
- No user behavior tracking (implicit signals)
- No contextual awareness (client relationships)

---

## 2. Refactoring Objectives

### 2.1 Core Principles

1. **Zero Manual Input**: User only uploads files; AI handles all decisions
2. **100% Accuracy Guarantee**: Learning systems optimize for precision, not speed
3. **Persistent Context**: Client data flows seamlessly across sessions
4. **Autonomous Generation**: AI drafts complete legal documents from templates
5. **Continuous Learning**: System improves from every interaction

### 2.2 User Experience Transformation

**Before (Current)**:
```
1. User selects document type from dropdown (10s)
2. User uploads file (5s)
3. User waits for extraction (30-60s)
4. User reviews extracted fields (60-120s)
5. User copies relevant fields (30s)
6. User opens Word/Google Docs (10s)
7. User searches for template (60-120s)
8. User manually fills template (20-30 min)
9. User formats document (5-10 min)
Total: 30-45 minutes
```

**After (Target)**:
```
1. User drags file into app (3s)
   → AI detects type, client, case (instant)
   → AI extracts clean data (30s)
   → AI selects/generates template (5s)
   → AI fills and formats document (10s)
2. User reviews final document (60-120s)
3. User clicks "Approve" or "Regenerate with feedback" (2s)
Total: 2-3 minutes
```

---

## 3. New System Architecture

### 3.1 Multi-Layer Learning Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     INPUT LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Document    │  │   Client     │  │   User       │         │
│  │  Upload      │  │   Context    │  │   History    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              FAST LEARNING LAYER (Phase 1)                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Bayesian Optimizer                                       │ │
│  │  ├── Document Type Classifier (5-10 samples to 95%+)     │ │
│  │  ├── Extraction Zone Detector (10-20 samples to 90%+)    │ │
│  │  └── Template Selector (5-15 samples to 85%+)            │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  GPT-4 Rule Evolution                                     │ │
│  │  ├── Classification Rules (every 10 feedbacks)           │ │
│  │  ├── Extraction Filters (every 15 feedbacks)             │ │
│  │  └── Template Patterns (every 20 feedbacks)              │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│             SLOW LEARNING LAYER (Phase 2)                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Deep Neural Networks (PyTorch)                           │ │
│  │  ├── Document Quality Predictor (ResNet-50 backbone)     │ │
│  │  ├── Extraction Anomaly Detector (Autoencoder)           │ │
│  │  └── Template Quality Scorer (Transformer)               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CONTEXT LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   CRM        │  │  Template    │  │  Knowledge   │         │
│  │   Database   │  │  Library     │  │  Graph       │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  OUTPUT LAYER                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Classified  │  │  Extracted   │  │  Generated   │         │
│  │  Document    │  │  Clean Data  │  │  Legal Doc   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack Additions

```
Current Stack:
├── Next.js 15 (Frontend + API)
├── Supabase PostgreSQL (Database)
├── AWS Textract (OCR)
├── Claude Sonnet 4 (Extraction)
├── Gemini 2.5 Pro (Extraction)
└── AWS Lambda (Async processing)

New Additions:
├── Python FastAPI ML Service (Bayesian Optimizer, DNN serving)
├── PyTorch (Deep Learning Models)
├── scikit-learn / scikit-optimize (Bayesian Optimization)
├── Redis (Real-time caching, job queues)
├── Neo4j or PostgreSQL JSONB (Client relationship graph)
├── Elasticsearch (Template search, full-text search)
├── AWS SageMaker (Optional: Model training/hosting)
└── Temporal.io or Bull (Workflow orchestration)
```

---

## 4. Feature 1: Zero-Touch Document Type Detection

### 4.1 Problem Statement

**Current**: User manually selects from 3 options: `patente_empresa`, `patente_sociedad`, `otros`
**Issue**: Wastes time, prone to errors, limits scalability (what if 50 document types exist?)

**Target**: AI automatically detects document type with 100% accuracy after sufficient training.

### 4.2 Learning System Design

#### Phase 1: Fast Learning (Bayesian Optimization)

**Goal**: Achieve 95%+ accuracy with 5-10 labeled samples per new document type.

**Approach**: Optimize classification features using Gaussian Process.

```python
# ml-service/classification/optimizer.py

from skopt import Optimizer
from skopt.space import Real, Categorical

class DocumentClassificationOptimizer:
    def __init__(self):
        # Feature importance weights to optimize
        self.search_space = [
            Real(0.0, 1.0, name='visual_weight'),      # Layout similarity
            Real(0.0, 1.0, name='textual_weight'),     # Keyword matching
            Real(0.0, 1.0, name='structural_weight'),  # Document structure
            Real(0.0, 1.0, name='metadata_weight'),    # File metadata
            Categorical(['claude', 'gemini', 'ensemble'], name='classifier')
        ]

        self.optimizer = Optimizer(
            dimensions=self.search_space,
            base_estimator='GP',
            acq_func='EI',
            n_initial_points=3
        )

    def suggest_features(self):
        """Suggest next feature combination to try."""
        return self.optimizer.ask()

    def update(self, features, accuracy):
        """Update model with classification result."""
        self.optimizer.tell(features, -accuracy)  # Minimize negative
```

**Classification Features**:
1. **Visual Features**:
   - Layout fingerprint (logo position, text blocks)
   - Color histogram
   - Page count

2. **Textual Features**:
   - TF-IDF of first 1000 characters
   - Presence of key phrases ("Solicitud de Patente", "Certificado de", etc.)
   - Language detection

3. **Structural Features**:
   - Table presence/count
   - Signature zones
   - Stamp/seal detection

4. **Metadata Features**:
   - File size range
   - Creation date patterns
   - Filename patterns

**Training Flow**:
```
User uploads → Extract features → Ask Bayesian optimizer for weights →
Classify with weighted features → User confirms/corrects →
Update optimizer with (features, accuracy) → Repeat
```

#### Phase 2: Deep Learning Classifier

**Goal**: Once 50+ samples per type collected, train CNN for robust classification.

**Architecture**:
```python
# ml-service/classification/deep_classifier.py

import torch
import torch.nn as nn
from torchvision import models

class DocumentTypeClassifier(nn.Module):
    def __init__(self, num_classes=10):
        super().__init__()

        # Visual branch (ResNet-50)
        self.visual_encoder = models.resnet50(pretrained=True)
        self.visual_encoder.fc = nn.Identity()

        # Textual branch (BERT)
        self.text_encoder = BertModel.from_pretrained('bert-base-multilingual-cased')

        # Fusion layer
        self.fusion = nn.Sequential(
            nn.Linear(2048 + 768, 512),  # ResNet + BERT
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Linear(128, num_classes)
        )

    def forward(self, image, text_tokens):
        visual_features = self.visual_encoder(image)
        text_features = self.text_encoder(**text_tokens).pooler_output
        combined = torch.cat([visual_features, text_features], dim=1)
        return self.fusion(combined)
```

**Training Strategy**:
- Transfer learning from ImageNet (visual) + BERT (text)
- Fine-tune on legal documents (50+ samples per class)
- Data augmentation: rotation, brightness, OCR noise simulation
- Class balancing with weighted loss

#### GPT-4 Rule Evolution

**Trigger**: Every 10 misclassifications or user corrections.

**Process**:
1. Collect recent misclassifications with user corrections
2. Extract common patterns (e.g., "All misclassified as X have logo in top-right")
3. Call GPT-4 to generate classification rules:

```typescript
// lib/classification-evolution.ts

async function evolveClassificationRules() {
  const misclassifications = await getRecentMisclassifications(20);

  const prompt = `
You are an expert in Chilean legal document classification.

Recent misclassifications:
${JSON.stringify(misclassifications, null, 2)}

Analyze patterns and generate improved classification rules in JSON format:
{
  "rules": [
    {
      "condition": "Contains phrase 'Solicitud de Patente' in first 100 chars",
      "predicted_type": "patente_empresa",
      "confidence_boost": 0.3
    },
    ...
  ],
  "reasoning": "..."
}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a legal document classification expert.' },
      { role: 'user', content: prompt }
    ]
  });

  const evolved = JSON.parse(response.content);

  // Backtest new rules
  const accuracy = await backtestRules(evolved.rules);

  if (accuracy > currentRulesAccuracy + 0.02) {
    await saveClassificationRules(evolved);
  }
}
```

### 4.3 Implementation Details

#### Database Schema

```sql
-- New table: Document types registry
CREATE TABLE document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  sample_count INTEGER DEFAULT 0,
  avg_classification_confidence DECIMAL(3,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- New table: Classification feedback
CREATE TABLE classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  predicted_type VARCHAR(100),
  actual_type VARCHAR(100),
  confidence DECIMAL(3,2),
  correction_reason TEXT,
  corrected_by UUID REFERENCES users(id),
  corrected_at TIMESTAMP DEFAULT NOW(),
  feature_vector JSONB,
  INDEX idx_predicted_actual (predicted_type, actual_type)
);

-- New table: Classification rules (GPT-4 evolved)
CREATE TABLE classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  rules JSONB NOT NULL,
  accuracy_score DECIMAL(4,3),
  samples_tested INTEGER,
  is_active BOOLEAN DEFAULT FALSE,
  evolution_reason TEXT,
  parent_version_id UUID REFERENCES classification_rules(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- New table: Classification model versions
CREATE TABLE classification_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50), -- 'bayesian' | 'deep_cnn' | 'ensemble'
  version VARCHAR(20),
  model_path TEXT, -- S3 path to serialized model
  accuracy_score DECIMAL(4,3),
  trained_on_samples INTEGER,
  is_active BOOLEAN DEFAULT FALSE,
  training_config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### API Endpoints

```typescript
// POST /api/classify
// Auto-classify document (called automatically after upload)
interface ClassifyRequest {
  documentId: string;
}

interface ClassifyResponse {
  document_type: string;
  confidence: number;
  explanation: string;
  alternative_types?: Array<{ type: string; confidence: number }>;
}

// POST /api/classify/feedback
// Submit classification correction
interface ClassifyFeedbackRequest {
  documentId: string;
  predicted_type: string;
  actual_type: string;
  reason?: string;
}

// POST /api/classify/evolve
// Trigger rule evolution (admin only)
interface ClassifyEvolveResponse {
  new_version: number;
  accuracy_improvement: number;
  rules_changed: number;
}
```

#### ML Service Integration

```python
# ml-service/classification/main.py

from fastapi import FastAPI
from .optimizer import DocumentClassificationOptimizer
from .deep_classifier import DocumentTypeClassifier

app = FastAPI()

# In-memory model cache
optimizers = {}  # user_id -> optimizer instance
deep_model = DocumentTypeClassifier.load('models/classifier_v1.pth')

@app.post("/classify/suggest")
async def suggest_classification(
    document_id: str,
    visual_features: List[float],
    textual_features: List[float],
    user_id: str
):
    """
    Classify document using current best model.
    """
    if user_id not in optimizers:
        optimizers[user_id] = DocumentClassificationOptimizer()

    # Phase 1: Use Bayesian-optimized features
    weights = optimizers[user_id].get_best_weights()
    score = compute_weighted_score(visual_features, textual_features, weights)

    # Phase 2: Use deep model if available
    if deep_model.is_trained:
        deep_score = deep_model.predict(visual_features, textual_features)
        # Ensemble: average Phase 1 + Phase 2
        final_score = 0.3 * score + 0.7 * deep_score
    else:
        final_score = score

    return {
        "predicted_type": doc_types[np.argmax(final_score)],
        "confidence": float(np.max(final_score)),
        "alternatives": get_top_k(final_score, k=3)
    }

@app.post("/classify/update")
async def update_classification_model(
    features: List[float],
    actual_type: str,
    user_id: str
):
    """
    Update Bayesian optimizer with feedback.
    """
    optimizer = optimizers[user_id]
    accuracy = 1.0 if predicted == actual_type else 0.0
    optimizer.update(features, accuracy)

    return {"updated": True}
```

### 4.4 Convergence Strategy

**Target**: 100% accuracy for common document types (>50 samples), 95%+ for rare types (<10 samples).

**Phase 1 (Fast Learning)**:
- Samples 1-5: Random feature weights, collect feedback
- Samples 6-20: Bayesian optimization converges to best weights
- Target: 90-95% accuracy by sample 10

**Phase 2 (Deep Learning)**:
- Samples 50+: Train deep CNN
- Transfer learning from legal document corpus (if available)
- Target: 98-100% accuracy

**Fallback**:
- If confidence < 0.85, show user 3 most likely options for manual selection
- User selection becomes training sample
- After 10 uncertain cases, retrain

---

## 5. Feature 2: Intelligent CRM System

### 5.1 Problem Statement

**Current**: No persistent client data; lawyer re-enters same information repeatedly.
**Issue**: 10-20 minutes wasted per day looking up/re-entering client details.

**Target**: Automatic client recognition, relationship mapping, context awareness.

### 5.2 CRM Data Model

#### Entity Relationship Graph

```
Lawyer (User)
  │
  ├─► Client (Person or Organization)
  │     ├─► Company (if client is a business)
  │     │     ├─► Shareholders
  │     │     ├─► Legal Representative
  │     │     └─► Business Activity
  │     │
  │     ├─► Case (Legal matter)
  │     │     ├─► Documents
  │     │     ├─► Deadlines
  │     │     ├─► Status (active, closed, pending)
  │     │     └─► Related Cases
  │     │
  │     └─► Projects (e.g., Patent application)
  │           ├─► Documents
  │           ├─► Milestones
  │           └─► Status
  │
  └─► Templates (User-approved templates)
```

#### Database Schema

```sql
-- Core CRM tables

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_type VARCHAR(50) CHECK (client_type IN ('person', 'organization')),

  -- Person fields
  first_name VARCHAR(200),
  last_name VARCHAR(200),
  rut VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(50),

  -- Organization fields
  company_name VARCHAR(300),
  company_rut VARCHAR(20) UNIQUE,
  legal_representative_name VARCHAR(200),
  business_activity TEXT,

  -- Metadata
  address TEXT,
  notes TEXT,
  tags TEXT[], -- ['corporate', 'patent', 'litigation']

  -- Data freshness
  last_interaction_at TIMESTAMP,
  data_last_updated_at TIMESTAMP DEFAULT NOW(),
  data_freshness_score DECIMAL(3,2), -- 0.0-1.0 (age-based decay)

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_lawyer_client (lawyer_id, client_type),
  INDEX idx_rut (rut),
  INDEX idx_company_rut (company_rut),
  INDEX idx_freshness (data_freshness_score DESC)
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_name VARCHAR(300) NOT NULL,
  company_rut VARCHAR(20) UNIQUE NOT NULL,
  legal_form VARCHAR(100), -- 'SpA', 'Ltda', 'SA', etc.
  incorporation_date DATE,
  capital DECIMAL(18,2),
  shareholders JSONB, -- [{ name, rut, shares, percentage }]
  directors JSONB,
  address TEXT,
  business_activity TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  case_number VARCHAR(100),
  case_type VARCHAR(100), -- 'patent', 'trademark', 'litigation', etc.
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) CHECK (status IN ('active', 'pending', 'closed', 'archived')),
  priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Deadlines
  next_deadline DATE,
  final_deadline DATE,

  -- Relationships
  related_case_ids UUID[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,

  INDEX idx_client_case (client_id, status),
  INDEX idx_deadlines (next_deadline, status)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,

  project_type VARCHAR(100), -- 'patent_application', 'trademark_registration', etc.
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) CHECK (status IN ('planning', 'in_progress', 'completed', 'cancelled')),

  -- Milestones
  milestones JSONB, -- [{ name, due_date, completed, notes }]
  completion_percentage INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  INDEX idx_client_project (client_id, status)
);

-- Document-to-Entity linking

CREATE TABLE document_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,

  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  confidence DECIMAL(3,2), -- 0.0-1.0
  detected_by VARCHAR(50), -- 'ai' | 'user' | 'extraction'
  detected_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_document (document_id),
  INDEX idx_client (client_id)
);

-- Data freshness tracking

CREATE TABLE entity_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID REFERENCES users(id),
  entity_type VARCHAR(50), -- 'client' | 'case' | 'project'
  entity_id UUID NOT NULL,

  interaction_type VARCHAR(50), -- 'document_upload' | 'view' | 'edit' | 'email'
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at DESC)
);
```

### 5.3 Client Recognition System

**Goal**: Automatically detect which client a document belongs to from extracted data.

**Approach**: Multi-signal matching with confidence scoring.

```typescript
// lib/crm/client-recognition.ts

interface RecognitionSignals {
  rut_match?: { client_id: string; confidence: 1.0 };
  name_match?: { client_id: string; confidence: number };
  address_match?: { client_id: string; confidence: number };
  historical_pattern?: { client_id: string; confidence: number };
}

async function recognizeClientFromExtraction(
  extractedData: RawExtractionFields,
  lawyerId: string
): Promise<ClientRecognitionResult> {

  const signals: RecognitionSignals = {};

  // Signal 1: RUT match (100% confidence if unique)
  if (extractedData.rut) {
    const client = await db.query(`
      SELECT id FROM clients
      WHERE lawyer_id = $1 AND (rut = $2 OR company_rut = $2)
    `, [lawyerId, extractedData.rut]);

    if (client) {
      signals.rut_match = { client_id: client.id, confidence: 1.0 };
    }
  }

  // Signal 2: Name fuzzy match
  if (extractedData.nombre || extractedData.razon_social) {
    const name = extractedData.nombre || extractedData.razon_social;
    const clients = await db.query(`
      SELECT id, first_name, last_name, company_name,
             similarity(COALESCE(company_name, first_name || ' ' || last_name), $1) as sim
      FROM clients
      WHERE lawyer_id = $2 AND similarity(COALESCE(company_name, first_name || ' ' || last_name), $1) > 0.6
      ORDER BY sim DESC
      LIMIT 1
    `, [name, lawyerId]);

    if (clients.length > 0) {
      signals.name_match = {
        client_id: clients[0].id,
        confidence: clients[0].sim
      };
    }
  }

  // Signal 3: Address match
  if (extractedData.domicilio) {
    const clients = await db.query(`
      SELECT id, similarity(address, $1) as sim
      FROM clients
      WHERE lawyer_id = $2 AND similarity(address, $1) > 0.7
      ORDER BY sim DESC
      LIMIT 1
    `, [extractedData.domicilio, lawyerId]);

    if (clients.length > 0) {
      signals.address_match = {
        client_id: clients[0].id,
        confidence: clients[0].sim
      };
    }
  }

  // Signal 4: Historical pattern (same doc type → same client)
  const recentSimilarDocs = await db.query(`
    SELECT de.client_id, COUNT(*) as freq
    FROM documents d
    JOIN document_entities de ON d.id = de.document_id
    WHERE d.user_id = $1
      AND d.doc_type = $2
      AND d.uploaded_at > NOW() - INTERVAL '6 months'
    GROUP BY de.client_id
    ORDER BY freq DESC
    LIMIT 1
  `, [lawyerId, extractedData.document_type]);

  if (recentSimilarDocs.length > 0) {
    const totalDocs = recentSimilarDocs.reduce((sum, r) => sum + r.freq, 0);
    signals.historical_pattern = {
      client_id: recentSimilarDocs[0].client_id,
      confidence: recentSimilarDocs[0].freq / totalDocs
    };
  }

  // Aggregate signals
  const candidates = aggregateSignals(signals);

  if (candidates.length === 0) {
    return { recognized: false, suggestions: [] };
  }

  const topCandidate = candidates[0];

  if (topCandidate.confidence > 0.85) {
    // Auto-link with high confidence
    await linkDocumentToClient(extractedData.document_id, topCandidate.client_id);
    return {
      recognized: true,
      client_id: topCandidate.client_id,
      confidence: topCandidate.confidence
    };
  } else {
    // Show suggestions to user
    return {
      recognized: false,
      suggestions: candidates.slice(0, 3)
    };
  }
}

function aggregateSignals(signals: RecognitionSignals): ClientCandidate[] {
  const clientScores = new Map<string, number>();

  // Weight different signals
  const weights = {
    rut_match: 1.0,          // RUT is unique, highest weight
    name_match: 0.6,         // Names can be ambiguous
    address_match: 0.4,      // Addresses change
    historical_pattern: 0.3  // Patterns are hints
  };

  for (const [signalType, signal] of Object.entries(signals)) {
    if (!signal) continue;
    const weight = weights[signalType];
    const currentScore = clientScores.get(signal.client_id) || 0;
    clientScores.set(
      signal.client_id,
      currentScore + (signal.confidence * weight)
    );
  }

  // Normalize scores to 0-1 range
  const maxScore = Math.max(...clientScores.values());
  const candidates = Array.from(clientScores.entries())
    .map(([client_id, score]) => ({
      client_id,
      confidence: score / maxScore
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return candidates;
}
```

### 5.4 Data Freshness System

**Goal**: Visual indicator showing how recent client data is.

**Approach**: Time-based decay function + interaction tracking.

```typescript
// lib/crm/freshness.ts

interface FreshnessScore {
  score: number;        // 0.0-1.0
  color: string;        // 'green' | 'yellow' | 'red'
  label: string;        // 'Fresh' | 'Stale' | 'Very Old'
  last_update: Date;
  recommendation?: string;
}

function calculateDataFreshness(
  lastInteractionAt: Date,
  dataLastUpdatedAt: Date
): FreshnessScore {
  const now = new Date();
  const daysSinceInteraction = (now.getTime() - lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceUpdate = (now.getTime() - dataLastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay: score = e^(-λt)
  // λ = 0.01 means 50% freshness after ~69 days
  const lambda = 0.01;
  const interactionFreshness = Math.exp(-lambda * daysSinceInteraction);
  const updateFreshness = Math.exp(-lambda * daysSinceUpdate);

  // Weighted average (interactions matter more)
  const score = 0.7 * interactionFreshness + 0.3 * updateFreshness;

  let color: string;
  let label: string;
  let recommendation: string | undefined;

  if (score > 0.8) {
    color = 'green';
    label = 'Fresh';
  } else if (score > 0.5) {
    color = 'yellow';
    label = 'Stale';
    recommendation = 'Consider updating client information';
  } else {
    color = 'red';
    label = 'Very Old';
    recommendation = 'Client data needs refresh - schedule follow-up';
  }

  return {
    score,
    color,
    label,
    last_update: lastInteractionAt,
    recommendation
  };
}

// Auto-update freshness scores (cron job)
async function updateFreshnessScores() {
  const clients = await db.query(`
    SELECT id, last_interaction_at, data_last_updated_at
    FROM clients
  `);

  for (const client of clients) {
    const freshness = calculateDataFreshness(
      client.last_interaction_at,
      client.data_last_updated_at
    );

    await db.query(`
      UPDATE clients
      SET data_freshness_score = $1
      WHERE id = $2
    `, [freshness.score, client.id]);
  }
}
```

### 5.5 Frontend CRM Components

#### Client Context Sidebar

```typescript
// components/ClientContextSidebar.tsx

interface ClientContextProps {
  documentId: string;
}

export function ClientContextSidebar({ documentId }: ClientContextProps) {
  const { client, loading } = useClientContext(documentId);

  if (loading) return <Skeleton />;
  if (!client) return null;

  const freshness = calculateDataFreshness(
    client.last_interaction_at,
    client.data_last_updated_at
  );

  return (
    <aside className="w-80 border-l border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Client Context</h3>
        <FreshnessBadge freshness={freshness} />
      </div>

      <ClientCard client={client} />

      <Tabs>
        <Tab label="Recent Cases">
          <CaseList clientId={client.id} limit={5} />
        </Tab>
        <Tab label="Documents">
          <DocumentList clientId={client.id} limit={10} />
        </Tab>
        <Tab label="Timeline">
          <InteractionTimeline clientId={client.id} />
        </Tab>
      </Tabs>

      {freshness.recommendation && (
        <Alert variant="warning">
          {freshness.recommendation}
        </Alert>
      )}
    </aside>
  );
}

function FreshnessBadge({ freshness }: { freshness: FreshnessScore }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full`}
        style={{ backgroundColor: freshness.color }}
      />
      <span className="text-sm text-gray-600">
        {freshness.label}
      </span>
      <Tooltip content={`Last interaction: ${formatDate(freshness.last_update)}`}>
        <InfoIcon className="w-4 h-4 text-gray-400" />
      </Tooltip>
    </div>
  );
}
```

### 5.6 API Endpoints

```typescript
// GET /api/crm/clients
// List lawyer's clients with freshness
interface ClientListResponse {
  clients: Array<{
    id: string;
    name: string;
    type: 'person' | 'organization';
    rut: string;
    freshness: FreshnessScore;
    active_cases: number;
    last_interaction: Date;
  }>;
}

// GET /api/crm/clients/[id]
// Get full client details
interface ClientDetailResponse {
  client: Client;
  companies: Company[];
  cases: Case[];
  projects: Project[];
  recent_documents: Document[];
  freshness: FreshnessScore;
}

// POST /api/crm/clients
// Create new client (auto-created from document if recognized)
interface CreateClientRequest {
  type: 'person' | 'organization';
  first_name?: string;
  last_name?: string;
  company_name?: string;
  rut: string;
  email?: string;
  phone?: string;
}

// GET /api/crm/recognize?documentId=...
// Get client recognition results for document
interface RecognizeClientResponse {
  recognized: boolean;
  client_id?: string;
  confidence?: number;
  suggestions?: Array<{
    client_id: string;
    name: string;
    confidence: number;
  }>;
}

// POST /api/crm/link
// Manually link document to client
interface LinkDocumentRequest {
  document_id: string;
  client_id: string;
  case_id?: string;
  project_id?: string;
}
```

---

## 6. Feature 3: Smart Extraction Filtering

### 6.1 Problem Statement

**Current**: Extraction includes headers, footers, stamps, watermarks, page numbers.
**Issue**: User must manually filter out noise; wastes 5-10 minutes per document.

**Target**: AI learns which text zones are relevant vs noise; auto-filters extraction.

### 6.2 Learning System Design

#### Zone Classification Approach

**Goal**: Classify each text block as: `relevant`, `header`, `footer`, `stamp`, `watermark`, `page_number`, `annotation`

**Features per Text Block**:
```typescript
interface TextBlockFeatures {
  // Position
  page_number: number;
  x_position: number;  // 0.0-1.0 (normalized)
  y_position: number;  // 0.0-1.0 (normalized)
  width: number;
  height: number;

  // Content
  text: string;
  word_count: number;
  char_count: number;
  has_numbers: boolean;
  has_special_chars: boolean;
  all_caps: boolean;

  // Context
  distance_from_top: number;
  distance_from_bottom: number;
  repeats_across_pages: boolean;
  similar_on_other_pages: number; // count

  // Visual
  font_size?: number;
  is_bold?: boolean;
  is_italic?: boolean;
  color?: string;
}
```

#### Phase 1: Rule-Based + Bayesian Optimization

**Initial Rules** (heuristic):
```python
# ml-service/filtering/rules.py

def classify_text_block_heuristic(block: TextBlockFeatures) -> str:
    # Rule 1: Page numbers
    if (block.word_count <= 2 and
        block.has_numbers and
        (block.y_position < 0.05 or block.y_position > 0.95)):
        return 'page_number'

    # Rule 2: Headers (top of page, repeats)
    if (block.y_position < 0.1 and
        block.repeats_across_pages and
        block.word_count < 20):
        return 'header'

    # Rule 3: Footers (bottom of page, repeats)
    if (block.y_position > 0.9 and
        block.repeats_across_pages):
        return 'footer'

    # Rule 4: Stamps (small, rotated, special chars)
    if (block.has_special_chars and
        block.all_caps and
        block.char_count < 50):
        return 'stamp'

    # Rule 5: Watermarks (center, large, faint)
    if (0.3 < block.x_position < 0.7 and
        0.3 < block.y_position < 0.7 and
        block.word_count < 10):
        return 'watermark'

    # Default: relevant content
    return 'relevant'
```

**Bayesian Optimization** of rule thresholds:
```python
# ml-service/filtering/optimizer.py

from skopt import Optimizer
from skopt.space import Real, Integer

class ExtractionFilterOptimizer:
    def __init__(self):
        # Optimize thresholds for rules
        self.search_space = [
            Real(0.0, 0.2, name='header_y_threshold'),
            Real(0.8, 1.0, name='footer_y_threshold'),
            Integer(1, 30, name='header_max_words'),
            Integer(1, 100, name='stamp_max_chars'),
            Real(0.0, 1.0, name='repeat_similarity_threshold')
        ]

        self.optimizer = Optimizer(
            dimensions=self.search_space,
            base_estimator='GP',
            acq_func='EI',
            n_initial_points=5
        )

    def suggest_thresholds(self):
        return self.optimizer.ask()

    def update(self, thresholds, accuracy):
        self.optimizer.tell(thresholds, -accuracy)
```

**Training Flow**:
```
Extract all text blocks → Classify with rules → Show user blocks marked as "noise" →
User corrects (marks blocks as relevant/not relevant) → Update optimizer →
Optimizer suggests better thresholds → Repeat
```

#### Phase 2: Deep Learning Sequence Model

**Goal**: Train neural network to classify text blocks in sequence (context matters).

**Architecture**: Bidirectional LSTM with attention.

```python
# ml-service/filtering/sequence_classifier.py

import torch
import torch.nn as nn

class TextBlockSequenceClassifier(nn.Module):
    def __init__(self, feature_dim=20, hidden_dim=128, num_classes=7):
        super().__init__()

        # Encoder: BiLSTM to capture page context
        self.bilstm = nn.LSTM(
            input_size=feature_dim,
            hidden_size=hidden_dim,
            num_layers=2,
            bidirectional=True,
            dropout=0.2
        )

        # Attention mechanism
        self.attention = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1)
        )

        # Classifier head
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim * 2, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, num_classes)
        )

    def forward(self, block_features):
        # block_features: (seq_len, batch, feature_dim)
        lstm_out, _ = self.bilstm(block_features)

        # Attention weights
        attn_weights = torch.softmax(self.attention(lstm_out), dim=0)

        # Weighted sum
        context = (lstm_out * attn_weights).sum(dim=0)

        # Classify
        logits = self.classifier(context)
        return logits
```

**Why Sequence Model?**
- Headers/footers repeat across pages → sequence pattern
- Context matters: "Página 1" alone is ambiguous, but "Página 1" at top of every page is clearly a page number
- Attention highlights which blocks are important for classification

#### GPT-4 Rule Evolution

**Trigger**: Every 15 user corrections.

**Process**:
```typescript
// lib/filtering-evolution.ts

async function evolveFilteringRules() {
  const corrections = await getRecentFilteringCorrections(20);

  const prompt = `
You are an expert in legal document structure.

Recent filtering mistakes:
${JSON.stringify(corrections.map(c => ({
  text: c.block_text,
  predicted: c.predicted_class,
  actual: c.actual_class,
  position: { x: c.x_pos, y: c.y_pos, page: c.page },
  features: c.features
})), null, 2)}

Analyze patterns and generate improved filtering rules:
{
  "rules": [
    {
      "condition": "y_position > 0.92 AND contains_date AND repeats_across_pages",
      "classification": "footer",
      "priority": 1
    },
    ...
  ],
  "reasoning": "...",
  "example_matches": [...]
}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a document structure expert.' },
      { role: 'user', content: prompt }
    ]
  });

  const evolved = JSON.parse(response.content);

  // Backtest
  const accuracy = await backtestFilteringRules(evolved.rules);

  if (accuracy > currentAccuracy + 0.03) {
    await saveFilteringRules(evolved);
  }
}
```

### 6.3 Implementation Details

#### Database Schema

```sql
-- Text block storage with classifications

CREATE TABLE text_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  block_index INTEGER NOT NULL, -- Order within page

  text TEXT NOT NULL,
  bounding_box JSONB, -- { x, y, width, height }
  features JSONB, -- All computed features

  -- Classification
  predicted_class VARCHAR(50), -- 'relevant' | 'header' | 'footer' | 'stamp' | etc.
  actual_class VARCHAR(50), -- User correction
  confidence DECIMAL(3,2),

  -- Metadata
  classified_by VARCHAR(50), -- 'rule' | 'bayesian' | 'deep' | 'user'
  needs_review BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_extraction (extraction_id),
  INDEX idx_page (extraction_id, page_number, block_index)
);

-- Filtering feedback

CREATE TABLE filtering_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_block_id UUID REFERENCES text_blocks(id) ON DELETE CASCADE,
  predicted_class VARCHAR(50),
  actual_class VARCHAR(50),
  correction_reason TEXT,
  corrected_by UUID REFERENCES users(id),
  corrected_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_correction (predicted_class, actual_class)
);

-- Filtering rules (GPT-4 evolved)

CREATE TABLE filtering_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  rules JSONB NOT NULL,
  accuracy_score DECIMAL(4,3),
  samples_tested INTEGER,
  is_active BOOLEAN DEFAULT FALSE,
  evolution_reason TEXT,
  parent_version_id UUID REFERENCES filtering_rules(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Filtering model versions

CREATE TABLE filtering_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50), -- 'rule_based' | 'bayesian' | 'lstm' | 'ensemble'
  version VARCHAR(20),
  model_path TEXT,
  accuracy_score DECIMAL(4,3),
  trained_on_samples INTEGER,
  is_active BOOLEAN DEFAULT FALSE,
  training_config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### API Endpoints

```typescript
// GET /api/extractions/[id]/blocks
// Get text blocks with classification
interface TextBlocksResponse {
  blocks: Array<{
    id: string;
    page: number;
    text: string;
    classification: string;
    confidence: number;
    bounding_box: { x: number; y: number; width: number; height: number };
    needs_review: boolean;
  }>;
  filtered_text: string; // Only 'relevant' blocks joined
}

// POST /api/filtering/feedback
// Correct block classification
interface FilteringFeedbackRequest {
  block_id: string;
  actual_class: string;
  reason?: string;
}

// POST /api/filtering/evolve
// Trigger rule evolution (admin)
interface FilteringEvolveResponse {
  new_version: number;
  accuracy_improvement: number;
  rules_changed: number;
}
```

#### ML Service Integration

```python
# ml-service/filtering/main.py

from fastapi import FastAPI
from .optimizer import ExtractionFilterOptimizer
from .sequence_classifier import TextBlockSequenceClassifier

app = FastAPI()

rule_optimizer = ExtractionFilterOptimizer()
deep_model = TextBlockSequenceClassifier.load('models/filter_v1.pth')

@app.post("/filter/classify")
async def classify_text_blocks(
    extraction_id: str,
    blocks: List[TextBlockFeatures]
):
    """
    Classify text blocks as relevant/noise.
    """
    # Extract features
    feature_matrix = extract_features(blocks)

    # Phase 1: Rule-based + Bayesian
    thresholds = rule_optimizer.get_best_thresholds()
    rule_classifications = classify_with_rules(blocks, thresholds)

    # Phase 2: Deep model (if trained)
    if deep_model.is_trained:
        deep_classifications = deep_model.predict(feature_matrix)
        # Ensemble: prefer deep model when confident
        final = ensemble_classify(rule_classifications, deep_classifications)
    else:
        final = rule_classifications

    return {
        "blocks": [
            {
                "block_id": i,
                "classification": final[i].label,
                "confidence": final[i].confidence
            }
            for i in range(len(blocks))
        ],
        "filtered_text": "".join([
            b.text for i, b in enumerate(blocks)
            if final[i].label == 'relevant'
        ])
    }

@app.post("/filter/update")
async def update_filtering_model(
    block_features: List[float],
    actual_class: str
):
    """
    Update optimizer with feedback.
    """
    accuracy = 1.0 if predicted == actual_class else 0.0
    rule_optimizer.update(block_features, accuracy)
    return {"updated": True}
```

### 6.4 Frontend UI for Filtering Review

```typescript
// components/ExtractionBlockReview.tsx

interface ExtractionBlockReviewProps {
  extractionId: string;
}

export function ExtractionBlockReview({ extractionId }: ExtractionBlockReviewProps) {
  const { blocks, loading } = useTextBlocks(extractionId);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());

  const relevantBlocks = blocks.filter(b => b.classification === 'relevant');
  const noiseBlocks = blocks.filter(b => b.classification !== 'relevant');

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3>Extracted Content (Relevant)</h3>
        <div className="space-y-2">
          {relevantBlocks.map(block => (
            <TextBlockCard
              key={block.id}
              block={block}
              onToggle={(id) => {
                // Mark as noise if incorrectly included
                submitFilteringFeedback(id, 'header'); // or footer, etc.
              }}
              showConfidence
            />
          ))}
        </div>
      </div>

      <div>
        <h3>Filtered Out (Noise)</h3>
        <div className="space-y-2 opacity-50">
          {noiseBlocks.map(block => (
            <TextBlockCard
              key={block.id}
              block={block}
              onToggle={(id) => {
                // Mark as relevant if incorrectly filtered
                submitFilteringFeedback(id, 'relevant');
              }}
              showClassification
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TextBlockCard({ block, onToggle, showConfidence, showClassification }) {
  return (
    <div className="border rounded p-2 hover:bg-gray-50 cursor-pointer" onClick={() => onToggle(block.id)}>
      <div className="flex justify-between items-start">
        <p className="text-sm">{block.text}</p>
        <div className="flex gap-2">
          {showConfidence && (
            <Badge variant={block.confidence > 0.9 ? 'success' : 'warning'}>
              {(block.confidence * 100).toFixed(0)}%
            </Badge>
          )}
          {showClassification && (
            <Badge variant="secondary">{block.classification}</Badge>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        Page {block.page} • Position: ({block.bounding_box.x.toFixed(2)}, {block.bounding_box.y.toFixed(2)})
      </div>
    </div>
  );
}
```

---

## 7. Feature 4: Autonomous Document Generation

### 7.1 Problem Statement

**Current**: User manually copies extracted data into Word/Google Docs, searches for templates, fills fields, formats.
**Issue**: 30-45 minutes per document; error-prone; inconsistent formatting.

**Target**: AI automatically generates complete, formatted legal documents from templates.

### 7.2 System Architecture

```
Extracted Data
  ↓
Template Selection AI
  ├── Search existing templates (Elasticsearch)
  ├── Search internet templates (Web scraping)
  ├── Use user-approved templates (Database)
  └── Generate new template (GPT-4)
  ↓
Template Filling Engine
  ├── Map extracted fields to template variables
  ├── Handle missing fields (ask user or infer)
  ├── Format dates, numbers, addresses
  └── Apply legal language conventions
  ↓
Document Formatter
  ├── Apply styles (headings, paragraphs, lists)
  ├── Generate table of contents
  ├── Add headers/footers
  └── Apply margins, spacing, fonts
  ↓
Quality Checker
  ├── Verify all fields filled
  ├── Check grammar/spelling
  ├── Validate legal requirements
  └── Flag suspicious content
  ↓
Generated Document (DOCX/PDF)
```

### 7.3 Template System

#### Template Schema

```sql
-- Template storage

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID REFERENCES users(id), -- NULL = public template

  template_name VARCHAR(300) NOT NULL,
  template_type VARCHAR(100), -- 'patent_application', 'power_of_attorney', etc.
  description TEXT,

  -- Template content
  document_structure JSONB NOT NULL, -- Hierarchical JSON structure
  variables JSONB NOT NULL, -- { fieldName: { type, required, default, validation } }
  styles JSONB, -- Formatting rules

  -- Metadata
  language VARCHAR(10) DEFAULT 'es',
  jurisdiction VARCHAR(50) DEFAULT 'CL',
  legal_domain VARCHAR(100), -- 'corporate', 'intellectual_property', etc.

  -- Quality metrics
  usage_count INTEGER DEFAULT 0,
  avg_user_rating DECIMAL(3,2),
  success_rate DECIMAL(3,2), -- % of docs generated without errors

  -- Approval
  status VARCHAR(50) CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,

  -- Source
  source VARCHAR(100), -- 'user_created' | 'web_scraped' | 'gpt_generated'
  source_url TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_lawyer (lawyer_id),
  INDEX idx_type (template_type),
  INDEX idx_status (status)
);

-- Template versions (track changes)

CREATE TABLE template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  document_structure JSONB NOT NULL,
  variables JSONB NOT NULL,
  change_summary TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(template_id, version_number)
);

-- Generated documents

CREATE TABLE generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,

  document_type VARCHAR(100),
  generated_content JSONB, -- Structured content before rendering
  rendered_docx_path TEXT, -- S3 path to DOCX
  rendered_pdf_path TEXT,  -- S3 path to PDF

  -- Quality
  quality_score DECIMAL(3,2),
  validation_errors JSONB,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_feedback TEXT,

  -- Status
  status VARCHAR(50) CHECK (status IN ('generating', 'ready', 'approved', 'regenerating', 'failed')),
  generation_time_ms INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,

  INDEX idx_extraction (extraction_id),
  INDEX idx_template (template_id),
  INDEX idx_status (status)
);

-- Template selection feedback (learning data)

CREATE TABLE template_selection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES extractions(id),
  selected_template_id UUID REFERENCES templates(id),
  alternative_templates JSONB, -- [{ template_id, score }]

  was_correct BOOLEAN,
  user_selected_template_id UUID REFERENCES templates(id), -- If user overrode
  feedback_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_extraction (extraction_id),
  INDEX idx_feedback (was_correct)
);
```

#### Template Structure (JSONB)

```typescript
// Example: Patent application template

interface TemplateStructure {
  metadata: {
    title: string;
    author: string;
    version: string;
  };

  sections: Array<{
    id: string;
    type: 'heading' | 'paragraph' | 'list' | 'table' | 'signature_block';
    level?: number; // For headings: 1, 2, 3
    content: string | string[] | { [key: string]: any };
    style?: {
      font_size?: number;
      bold?: boolean;
      italic?: boolean;
      alignment?: 'left' | 'center' | 'right' | 'justify';
      spacing_before?: number;
      spacing_after?: number;
    };
    variables?: string[]; // Variable names used in this section
  }>;

  variables: {
    [key: string]: {
      type: 'text' | 'number' | 'date' | 'address' | 'rut' | 'email';
      required: boolean;
      default?: any;
      validation?: {
        min_length?: number;
        max_length?: number;
        pattern?: string; // Regex
      };
      display_name: string;
      help_text?: string;
    };
  };

  formatting: {
    page_size: 'letter' | 'a4';
    margins: { top: number; bottom: number; left: number; right: number };
    font_family: string;
    font_size: number;
    line_spacing: number;
    header?: string;
    footer?: string;
  };
}

// Example instance
const patentTemplate: TemplateStructure = {
  metadata: {
    title: "Solicitud de Patente de Invención",
    author: "Legislazuli",
    version: "1.0"
  },

  sections: [
    {
      id: "header",
      type: "heading",
      level: 1,
      content: "SOLICITUD DE PATENTE DE INVENCIÓN",
      style: { font_size: 16, bold: true, alignment: 'center' }
    },
    {
      id: "applicant_section",
      type: "heading",
      level: 2,
      content: "I. DATOS DEL SOLICITANTE"
    },
    {
      id: "applicant_name",
      type: "paragraph",
      content: "Nombre/Razón Social: {{razon_social}}",
      variables: ["razon_social"]
    },
    {
      id: "applicant_rut",
      type: "paragraph",
      content: "RUT: {{rut}}",
      variables: ["rut"]
    },
    {
      id: "applicant_address",
      type: "paragraph",
      content: "Domicilio: {{domicilio}}",
      variables: ["domicilio"]
    },
    {
      id: "invention_section",
      type: "heading",
      level: 2,
      content: "II. DESCRIPCIÓN DE LA INVENCIÓN"
    },
    {
      id: "invention_title",
      type: "paragraph",
      content: "Título: {{titulo_invencion}}",
      variables: ["titulo_invencion"]
    },
    // ... more sections
  ],

  variables: {
    razon_social: {
      type: 'text',
      required: true,
      display_name: "Razón Social del Solicitante",
      validation: { min_length: 3, max_length: 300 }
    },
    rut: {
      type: 'rut',
      required: true,
      display_name: "RUT del Solicitante",
      validation: { pattern: '^\\d{1,2}\\.\\d{3}\\.\\d{3}-[\\dkK]$' }
    },
    domicilio: {
      type: 'address',
      required: true,
      display_name: "Domicilio del Solicitante"
    },
    titulo_invencion: {
      type: 'text',
      required: true,
      display_name: "Título de la Invención",
      validation: { min_length: 5, max_length: 200 }
    }
  },

  formatting: {
    page_size: 'letter',
    margins: { top: 2.5, bottom: 2.5, left: 3, right: 2 },
    font_family: 'Arial',
    font_size: 12,
    line_spacing: 1.5,
    footer: 'Página {{page_number}} de {{total_pages}}'
  }
};
```

### 7.4 Template Selection AI

#### Phase 1: Bayesian Optimization of Selection Features

**Goal**: Optimize feature weights for template ranking.

```python
# ml-service/templates/selector.py

from skopt import Optimizer
from skopt.space import Real

class TemplateSelectionOptimizer:
    def __init__(self):
        self.search_space = [
            Real(0.0, 1.0, name='doc_type_match_weight'),
            Real(0.0, 1.0, name='variable_coverage_weight'),
            Real(0.0, 1.0, name='usage_frequency_weight'),
            Real(0.0, 1.0, name='user_rating_weight'),
            Real(0.0, 1.0, name='text_similarity_weight')
        ]

        self.optimizer = Optimizer(
            dimensions=self.search_space,
            base_estimator='GP',
            acq_func='EI',
            n_initial_points=5
        )

    def rank_templates(self, extracted_data, templates, weights):
        scores = []

        for template in templates:
            # Feature 1: Document type match
            type_match = 1.0 if template.type == extracted_data.doc_type else 0.0

            # Feature 2: Variable coverage (% of template vars present in extraction)
            available_vars = set(extracted_data.keys())
            required_vars = set(template.variables.keys())
            coverage = len(available_vars & required_vars) / len(required_vars)

            # Feature 3: Usage frequency (normalized)
            usage_norm = template.usage_count / max_usage_count

            # Feature 4: User rating
            rating_norm = template.avg_user_rating / 5.0

            # Feature 5: Text similarity (extracted text vs template sample)
            text_sim = cosine_similarity(
                embed(extracted_data.full_text),
                embed(template.sample_text)
            )

            # Weighted score
            score = (
                weights[0] * type_match +
                weights[1] * coverage +
                weights[2] * usage_norm +
                weights[3] * rating_norm +
                weights[4] * text_sim
            )

            scores.append((template.id, score))

        return sorted(scores, key=lambda x: x[1], reverse=True)
```

#### Phase 2: Deep Learning Matching Model

**Goal**: Learn to match extractions to templates using transformer encoder.

```python
# ml-service/templates/matcher.py

import torch
import torch.nn as nn
from transformers import BertModel

class TemplateMatchingModel(nn.Module):
    def __init__(self):
        super().__init__()

        # Encode extraction text
        self.extraction_encoder = BertModel.from_pretrained('bert-base-multilingual-cased')

        # Encode template
        self.template_encoder = BertModel.from_pretrained('bert-base-multilingual-cased')

        # Matching head
        self.matcher = nn.Sequential(
            nn.Linear(768 * 2, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid()  # 0-1 match score
        )

    def forward(self, extraction_tokens, template_tokens):
        # Encode both
        extraction_emb = self.extraction_encoder(**extraction_tokens).pooler_output
        template_emb = self.template_encoder(**template_tokens).pooler_output

        # Concatenate embeddings
        combined = torch.cat([extraction_emb, template_emb], dim=1)

        # Match score
        score = self.matcher(combined)
        return score
```

**Training Data**:
- Positive pairs: (extraction, template) where user approved the template
- Negative pairs: (extraction, wrong_template) from rejected selections

#### GPT-4 Template Generation

**When to trigger**: No suitable template found (all candidates < 0.6 score).

**Process**:
```typescript
// lib/templates/generation.ts

async function generateTemplateWithGPT4(
  extractedData: RawExtractionFields,
  documentType: string
): Promise<TemplateStructure> {

  const prompt = `
You are an expert Chilean legal document template designer.

Generate a professional legal document template for: ${documentType}

Available data:
${JSON.stringify(extractedData, null, 2)}

Requirements:
1. Follow Chilean legal formatting standards
2. Include all necessary sections for this document type
3. Use proper legal language
4. Map all available extracted fields to template variables
5. Add sections for missing but typically required information

Output a JSON template structure with:
- metadata (title, version)
- sections (headings, paragraphs, lists, tables)
- variables (with types, validation, display names)
- formatting (margins, fonts, spacing)

Template must be ready to use (no placeholders).
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a legal document template expert.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  });

  const generatedTemplate = JSON.parse(response.content) as TemplateStructure;

  // Save as draft template
  const templateId = await saveTemplate({
    ...generatedTemplate,
    status: 'pending_approval',
    source: 'gpt_generated'
  });

  return generatedTemplate;
}
```

### 7.5 Template Filling Engine

```typescript
// lib/templates/filler.ts

interface TemplateFillOptions {
  extraction_id: string;
  template_id: string;
  overrides?: { [key: string]: any }; // User-provided values
}

async function fillTemplate(options: TemplateFillOptions): Promise<FilledDocument> {
  // Load extraction data
  const extraction = await getExtraction(options.extraction_id);
  const extractedData = extraction.consensus_result;

  // Load template
  const template = await getTemplate(options.template_id);

  // Map extracted fields to template variables
  const variableMapping = mapExtractedFieldsToTemplateVariables(
    extractedData,
    template.variables
  );

  // Apply overrides
  const finalValues = { ...variableMapping, ...options.overrides };

  // Validate all required variables are present
  const missingRequired = Object.entries(template.variables)
    .filter(([name, spec]) => spec.required && !finalValues[name])
    .map(([name, spec]) => ({ name, display_name: spec.display_name }));

  if (missingRequired.length > 0) {
    // Ask user to provide missing values
    throw new MissingRequiredFieldsError(missingRequired);
  }

  // Fill template sections
  const filledSections = template.sections.map(section => {
    let content = section.content;

    // Replace variables: {{variable_name}}
    if (typeof content === 'string') {
      content = content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = finalValues[varName];
        if (value === undefined) {
          return `[${varName} no disponible]`;
        }
        // Format value based on type
        return formatValue(value, template.variables[varName].type);
      });
    }

    return {
      ...section,
      content
    };
  });

  return {
    sections: filledSections,
    variables_used: Object.keys(finalValues),
    missing_variables: missingRequired.map(m => m.name)
  };
}

function mapExtractedFieldsToTemplateVariables(
  extractedData: any,
  templateVariables: any
): any {
  const mapping = {};

  for (const [varName, varSpec] of Object.entries(templateVariables)) {
    // Try exact match
    if (extractedData[varName]) {
      mapping[varName] = extractedData[varName];
      continue;
    }

    // Try fuzzy match (e.g., "razon_social" matches "nombre_empresa")
    const fuzzyMatch = findFuzzyMatch(varName, Object.keys(extractedData));
    if (fuzzyMatch && extractedData[fuzzyMatch]) {
      mapping[varName] = extractedData[fuzzyMatch];
      continue;
    }

    // Try semantic match (e.g., "domicilio" matches "direccion")
    const semanticMatch = findSemanticMatch(
      varName,
      varSpec.display_name,
      extractedData
    );
    if (semanticMatch) {
      mapping[varName] = semanticMatch;
      continue;
    }
  }

  return mapping;
}

function formatValue(value: any, type: string): string {
  switch (type) {
    case 'date':
      return new Date(value).toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

    case 'rut':
      return formatRUT(value); // e.g., "12.345.678-9"

    case 'number':
      return Number(value).toLocaleString('es-CL');

    case 'address':
      return capitalizeAddress(value);

    default:
      return String(value);
  }
}
```

### 7.6 Document Rendering

**Goal**: Convert filled template structure to DOCX/PDF.

**Library**: `docx` (npm package for DOCX generation)

```typescript
// lib/templates/renderer.ts

import { Document, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';
import { writeFileSync } from 'fs';

async function renderDocx(
  filledDocument: FilledDocument,
  template: TemplateStructure
): Promise<string> {

  const sections = filledDocument.sections.map(section => {
    switch (section.type) {
      case 'heading':
        return new Paragraph({
          text: section.content as string,
          heading: getHeadingLevel(section.level),
          alignment: getAlignment(section.style?.alignment),
          spacing: {
            before: section.style?.spacing_before || 0,
            after: section.style?.spacing_after || 240
          }
        });

      case 'paragraph':
        return new Paragraph({
          children: [
            new TextRun({
              text: section.content as string,
              bold: section.style?.bold,
              italics: section.style?.italic,
              size: section.style?.font_size ? section.style.font_size * 2 : 24 // Half-points
            })
          ],
          alignment: getAlignment(section.style?.alignment),
          spacing: {
            before: section.style?.spacing_before || 0,
            after: section.style?.spacing_after || 120,
            line: template.formatting.line_spacing * 240
          }
        });

      // Handle lists, tables, etc.
      // ...

      default:
        return new Paragraph({ text: '' });
    }
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: template.formatting.page_size === 'letter'
            ? { width: 11906, height: 16838 } // Twips
            : { width: 11906, height: 16838 }, // A4
          margin: {
            top: inchesToTwips(template.formatting.margins.top),
            bottom: inchesToTwips(template.formatting.margins.bottom),
            left: inchesToTwips(template.formatting.margins.left),
            right: inchesToTwips(template.formatting.margins.right)
          }
        }
      },
      children: sections
    }]
  });

  // Write to buffer
  const buffer = await Packer.toBuffer(doc);

  // Upload to S3
  const s3Key = `generated/${Date.now()}-${uuidv4()}.docx`;
  await s3Client.putObject({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  return s3Key;
}

async function renderPdf(docxPath: string): Promise<string> {
  // Use LibreOffice headless or Pandoc to convert DOCX → PDF
  // Or use a service like DocRaptor, CloudConvert

  const pdfBuffer = await convertDocxToPdf(docxPath);

  const s3Key = docxPath.replace('.docx', '.pdf');
  await s3Client.putObject({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: pdfBuffer,
    ContentType: 'application/pdf'
  });

  return s3Key;
}
```

### 7.7 Quality Checking

```typescript
// lib/templates/quality-checker.ts

interface QualityCheckResult {
  passed: boolean;
  score: number; // 0.0-1.0
  errors: QualityError[];
  warnings: QualityWarning[];
}

interface QualityError {
  type: 'missing_field' | 'invalid_format' | 'grammar_error' | 'legal_requirement';
  message: string;
  location?: { section_id: string };
  severity: 'high' | 'medium' | 'low';
}

async function checkDocumentQuality(
  filledDocument: FilledDocument,
  template: TemplateStructure
): Promise<QualityCheckResult> {

  const errors: QualityError[] = [];
  const warnings: QualityWarning[] = [];

  // Check 1: All required fields filled
  for (const [varName, varSpec] of Object.entries(template.variables)) {
    if (varSpec.required && !filledDocument.variables_used.includes(varName)) {
      errors.push({
        type: 'missing_field',
        message: `Campo obligatorio "${varSpec.display_name}" no fue llenado`,
        severity: 'high'
      });
    }
  }

  // Check 2: Format validation (RUT, dates, emails)
  for (const section of filledDocument.sections) {
    if (typeof section.content !== 'string') continue;

    // Validate RUTs
    const ruts = section.content.match(/\d{1,2}\.\d{3}\.\d{3}-[\dkK]/g) || [];
    for (const rut of ruts) {
      if (!validateRUT(rut)) {
        errors.push({
          type: 'invalid_format',
          message: `RUT inválido: ${rut}`,
          location: { section_id: section.id },
          severity: 'high'
        });
      }
    }

    // Validate dates
    // Validate emails
    // etc.
  }

  // Check 3: Grammar/spelling (optional: use LanguageTool API)
  const fullText = filledDocument.sections
    .map(s => typeof s.content === 'string' ? s.content : '')
    .join('\n');

  const grammarErrors = await checkGrammar(fullText);
  errors.push(...grammarErrors.map(e => ({
    type: 'grammar_error' as const,
    message: e.message,
    severity: 'low' as const
  })));

  // Check 4: Legal requirements (domain-specific)
  // Example: Patent applications must include certain sections
  if (template.template_type === 'patent_application') {
    const requiredSections = ['applicant_section', 'invention_section', 'claims_section'];
    const presentSections = filledDocument.sections.map(s => s.id);

    for (const reqSection of requiredSections) {
      if (!presentSections.includes(reqSection)) {
        errors.push({
          type: 'legal_requirement',
          message: `Sección obligatoria "${reqSection}" faltante`,
          severity: 'high'
        });
      }
    }
  }

  // Calculate quality score
  const errorPenalty = errors.reduce((sum, e) => {
    switch (e.severity) {
      case 'high': return sum + 0.2;
      case 'medium': return sum + 0.1;
      case 'low': return sum + 0.05;
    }
  }, 0);

  const score = Math.max(0, 1.0 - errorPenalty);

  return {
    passed: errors.filter(e => e.severity === 'high').length === 0,
    score,
    errors,
    warnings
  };
}
```

### 7.8 API Endpoints

```typescript
// POST /api/templates/search
// Search for templates matching extraction
interface TemplateSearchRequest {
  extraction_id: string;
  doc_type?: string;
}

interface TemplateSearchResponse {
  templates: Array<{
    id: string;
    name: string;
    description: string;
    match_score: number;
    variable_coverage: number;
    preview_url: string;
  }>;
  suggested_template_id?: string; // Top match
}

// POST /api/generate
// Generate document from template
interface GenerateDocumentRequest {
  extraction_id: string;
  template_id: string;
  overrides?: { [key: string]: any };
}

interface GenerateDocumentResponse {
  document_id: string;
  status: 'generating' | 'ready' | 'failed';
  docx_url?: string;
  pdf_url?: string;
  quality_check?: QualityCheckResult;
  missing_fields?: Array<{ name: string; display_name: string }>;
}

// POST /api/generate/feedback
// Provide feedback on generated document
interface GenerateFeedbackRequest {
  document_id: string;
  rating: number; // 1-5
  feedback: string;
  regenerate?: boolean;
  regeneration_instructions?: string;
}

// POST /api/templates/approve
// Approve a GPT-generated template
interface ApproveTemplateRequest {
  template_id: string;
  modifications?: Partial<TemplateStructure>;
}

// POST /api/templates/scrape
// Scrape templates from web (admin only)
interface ScrapeTemplatesRequest {
  urls: string[];
  doc_type: string;
}
```

---

## 8. Multi-Layer Learning System

### 8.1 Learning Architecture Overview

The system employs a **two-phase learning strategy** similar to the Latina image enhancement system:

**Phase 1: Fast Learning (0-50 samples)**
- Bayesian Optimization for parameter/feature tuning
- GPT-4 Rule Evolution for classification, filtering, template selection
- Goal: Achieve 85-95% accuracy quickly with minimal data

**Phase 2: Slow Learning (50+ samples)**
- Deep Neural Networks for quality prediction, anomaly detection
- Transfer learning from pre-trained models
- Goal: 95-99% accuracy, handle edge cases, continuous improvement

### 8.2 Learning Components Matrix

| Component | Phase 1 (Fast) | Phase 2 (Slow) | Evolution Trigger |
|-----------|---------------|---------------|-------------------|
| Document Classification | Bayesian feature weights | CNN (ResNet + BERT) | Every 10 misclassifications |
| Extraction Filtering | Bayesian thresholds | BiLSTM + Attention | Every 15 corrections |
| Template Selection | Bayesian ranking weights | Transformer matching model | Every 20 selections |
| Template Generation | GPT-4 generation | Fine-tuned GPT-4 | Every 30 usages |
| Quality Prediction | Rule-based checks | DNN quality scorer | Every 50 documents |

### 8.3 Convergence Tracking

```typescript
// lib/learning/convergence.ts

interface ConvergenceMetrics {
  component: string;
  phase: 'fast' | 'slow' | 'converged';
  samples_collected: number;
  current_accuracy: number;
  target_accuracy: number;
  convergence_score: number; // 0.0-1.0
  estimated_samples_to_target: number;
}

function calculateConvergence(
  samplesCollected: number,
  currentAccuracy: number,
  targetAccuracy: number,
  maxSamples: number = 50
): ConvergenceMetrics {

  // Sample factor: 0-1 based on samples collected
  const sampleFactor = Math.min(samplesCollected / maxSamples, 1.0);

  // Accuracy factor: 0-1 based on accuracy achieved
  const accuracyFactor = Math.min(currentAccuracy / targetAccuracy, 1.0);

  // Weighted convergence score
  const convergence = (sampleFactor * 0.6) + (accuracyFactor * 0.4);

  // Estimate samples needed (exponential decay model)
  const accuracyGap = targetAccuracy - currentAccuracy;
  const learningRate = currentAccuracy / samplesCollected; // Accuracy per sample
  const estimatedSamplesRemaining = Math.ceil(accuracyGap / learningRate);

  // Determine phase
  let phase: 'fast' | 'slow' | 'converged';
  if (convergence >= 0.95 && currentAccuracy >= targetAccuracy * 0.98) {
    phase = 'converged';
  } else if (samplesCollected >= maxSamples) {
    phase = 'slow';
  } else {
    phase = 'fast';
  }

  return {
    component: 'document_classification', // example
    phase,
    samples_collected: samplesCollected,
    current_accuracy: currentAccuracy,
    target_accuracy: targetAccuracy,
    convergence_score: convergence,
    estimated_samples_to_target: estimatedSamplesRemaining
  };
}
```

### 8.4 Feedback Collection Strategy

**Implicit Signals** (collected automatically):
```typescript
interface ImplicitFeedback {
  // Document classification
  time_to_confirm_type: number; // Fast = confident in classification
  corrected_type: boolean;

  // Extraction filtering
  copied_filtered_text: boolean; // Copied = good extraction
  manual_edits_count: number; // Edits = filtering mistakes

  // Template selection
  regenerated_document: boolean; // Regenerate = wrong template
  time_to_approve: number; // Fast approval = good match
  downloaded_document: boolean; // Download = satisfied

  // Document quality
  shared_with_client: boolean; // Shared = high quality
  rating_provided: number; // 1-5 stars
  feedback_text: string;
}
```

**Explicit Signals** (user actions):
```typescript
interface ExplicitFeedback {
  // Corrections
  classification_correction: { predicted: string; actual: string };
  filtering_correction: { block_id: string; actual_class: string };
  template_override: { suggested_id: string; selected_id: string };

  // Ratings
  extraction_rating: number; // 1-5
  document_rating: number; // 1-5

  // Comments
  feedback_comment: string;
  improvement_suggestion: string;
}
```

### 8.5 Learning Dashboard

```typescript
// components/LearningDashboard.tsx

export function LearningDashboard() {
  const { metrics, loading } = useLearningMetrics();

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Classification Learning */}
      <MetricCard
        title="Document Classification"
        convergence={metrics.classification.convergence}
        accuracy={metrics.classification.accuracy}
        samples={metrics.classification.samples}
        target={0.95}
      />

      {/* Filtering Learning */}
      <MetricCard
        title="Extraction Filtering"
        convergence={metrics.filtering.convergence}
        accuracy={metrics.filtering.accuracy}
        samples={metrics.filtering.samples}
        target={0.90}
      />

      {/* Template Selection Learning */}
      <MetricCard
        title="Template Selection"
        convergence={metrics.template_selection.convergence}
        accuracy={metrics.template_selection.accuracy}
        samples={metrics.template_selection.samples}
        target={0.85}
      />

      {/* Learning Trends */}
      <div className="col-span-3">
        <h3 className="text-lg font-semibold mb-4">Learning Progress Over Time</h3>
        <LineChart
          data={metrics.trends}
          xAxis="samples"
          yAxis="accuracy"
          series={['classification', 'filtering', 'template_selection']}
        />
      </div>

      {/* Recent Feedback */}
      <div className="col-span-3">
        <h3 className="text-lg font-semibold mb-4">Recent User Feedback</h3>
        <FeedbackTimeline feedback={metrics.recent_feedback} />
      </div>
    </div>
  );
}

function MetricCard({ title, convergence, accuracy, samples, target }) {
  const phase = convergence >= 0.95 ? 'Converged' : samples >= 50 ? 'Slow Learning' : 'Fast Learning';
  const color = convergence >= 0.95 ? 'green' : convergence >= 0.5 ? 'yellow' : 'red';

  return (
    <div className="border rounded-lg p-6">
      <h4 className="font-semibold mb-4">{title}</h4>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Convergence</span>
            <span className={`font-semibold text-${color}-600`}>
              {(convergence * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={convergence} color={color} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Accuracy</span>
            <div className="font-semibold">{(accuracy * 100).toFixed(1)}%</div>
          </div>
          <div>
            <span className="text-gray-500">Target</span>
            <div className="font-semibold">{(target * 100).toFixed(0)}%</div>
          </div>
        </div>

        <div className="text-sm">
          <span className="text-gray-500">Samples: </span>
          <span className="font-semibold">{samples}</span>
        </div>

        <Badge variant={color}>{phase}</Badge>
      </div>
    </div>
  );
}
```

---

## 9. Database Schema Changes

### 9.1 New Tables Summary

**Classification System** (4 tables):
- `document_types` - Registry of document types
- `classification_feedback` - User corrections
- `classification_rules` - GPT-4 evolved rules
- `classification_models` - Model versions

**CRM System** (7 tables):
- `clients` - Client profiles
- `companies` - Company details
- `cases` - Legal cases
- `projects` - Client projects
- `document_entities` - Document-to-entity linking
- `entity_interactions` - Interaction tracking

**Filtering System** (4 tables):
- `text_blocks` - Individual text blocks with classifications
- `filtering_feedback` - User corrections
- `filtering_rules` - GPT-4 evolved rules
- `filtering_models` - Model versions

**Template System** (5 tables):
- `templates` - Template storage
- `template_versions` - Version history
- `generated_documents` - Generated doc metadata
- `template_selection_feedback` - Selection feedback

**Learning System** (3 tables):
- `learning_metrics` - Convergence tracking
- `implicit_feedback` - Auto-collected signals
- `model_training_runs` - Training history

### 9.2 Schema Migration Strategy

**Phase 1: Non-Breaking Changes**
```sql
-- Add new tables without touching existing ones
CREATE TABLE document_types (...);
CREATE TABLE clients (...);
CREATE TABLE text_blocks (...);
CREATE TABLE templates (...);
-- etc.
```

**Phase 2: Add Foreign Keys to Existing Tables**
```sql
-- Add optional FK to documents table
ALTER TABLE documents
ADD COLUMN detected_by_model_id UUID REFERENCES classification_models(id);

ALTER TABLE documents
ADD COLUMN client_id UUID REFERENCES clients(id);
```

**Phase 3: Backfill Data**
```typescript
// Migrate existing documents to new system
async function migrateExistingDocuments() {
  const documents = await db.query(`SELECT * FROM documents`);

  for (const doc of documents) {
    // Create classification feedback from existing doc_type
    await createClassificationFeedback(doc);

    // Try to recognize client from extracted data
    const extraction = await getExtraction(doc.id);
    if (extraction) {
      await recognizeAndLinkClient(extraction, doc.user_id);
    }
  }
}
```

### 9.3 Indexes for Performance

```sql
-- Classification
CREATE INDEX idx_classification_feedback_accuracy
ON classification_feedback(predicted_type, actual_type);

-- CRM
CREATE INDEX idx_clients_freshness
ON clients(lawyer_id, data_freshness_score DESC);

CREATE INDEX idx_document_entities_client
ON document_entities(client_id, detected_at DESC);

-- Filtering
CREATE INDEX idx_text_blocks_classification
ON text_blocks(extraction_id, predicted_class, confidence DESC);

-- Templates
CREATE INDEX idx_templates_match_score
ON templates(template_type, status, avg_user_rating DESC);

-- Learning
CREATE INDEX idx_learning_metrics_convergence
ON learning_metrics(component, phase, convergence_score DESC);
```

---

## 10. API Endpoint Changes

### 10.1 Modified Existing Endpoints

**POST `/api/upload`** (Enhanced)
- **Before**: User selects doc_type → generates presigned URL
- **After**: User uploads → AI detects doc_type automatically → generates presigned URL
- **New Response**: Include `detected_document_type`, `confidence`, `client_suggestion`

**GET `/api/extractions/[id]`** (Enhanced)
- **Before**: Returns extraction fields
- **After**: Returns extraction fields + client context + filtered text + generated document
- **New Response Fields**:
  - `client: ClientContext`
  - `filtered_text: string`
  - `text_blocks: TextBlock[]`
  - `generated_document?: GeneratedDocument`

### 10.2 New Endpoint Groups

**Classification API** (`/api/classify/*`):
- `POST /classify` - Auto-classify document
- `POST /classify/feedback` - Submit correction
- `POST /classify/evolve` - Trigger rule evolution
- `GET /classify/metrics` - Get learning metrics

**CRM API** (`/api/crm/*`):
- `GET /crm/clients` - List clients
- `GET /crm/clients/[id]` - Client details
- `POST /crm/clients` - Create client
- `PUT /crm/clients/[id]` - Update client
- `GET /crm/recognize?documentId=...` - Recognize client from document
- `POST /crm/link` - Link document to client/case/project

**Filtering API** (`/api/filtering/*`):
- `GET /filtering/blocks?extractionId=...` - Get text blocks
- `POST /filtering/feedback` - Correct block classification
- `POST /filtering/evolve` - Trigger rule evolution

**Template API** (`/api/templates/*`):
- `POST /templates/search` - Search templates
- `POST /templates/generate` - Generate with GPT-4
- `POST /templates/approve` - Approve generated template
- `GET /templates/[id]` - Get template details

**Generation API** (`/api/generate/*`):
- `POST /generate` - Generate document
- `GET /generate/[id]/status` - Check generation status
- `POST /generate/feedback` - Rate generated document
- `POST /generate/regenerate` - Regenerate with feedback

**Learning API** (`/api/learning/*`):
- `GET /learning/metrics` - Overall metrics
- `GET /learning/convergence` - Convergence by component
- `GET /learning/feedback/recent` - Recent feedback

---

## 11. Frontend Changes

### 11.1 Simplified Upload Flow

**Before**:
```
Step 1: Select document type (dropdown)
Step 2: Upload file (drag-and-drop)
Step 3: Click "Process"
```

**After**:
```
Single Step: Drag file → AI handles everything → Show results
```

**New Component**:
```typescript
// components/SmartFileUpload.tsx

export function SmartFileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const handleFileDrop = async (droppedFile: File) => {
    setFile(droppedFile);
    setProcessing(true);

    try {
      // Upload to S3
      const { uploadUrl, key } = await getPresignedUrl(droppedFile.name);
      await uploadToS3(uploadUrl, droppedFile);

      // Start processing (async job)
      const jobId = await startDocumentProcessing(key);

      // Poll for results
      const result = await pollJobStatus(jobId);

      setResult(result);
    } catch (error) {
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  if (processing) {
    return <ProcessingAnimation />;
  }

  if (result) {
    return <ProcessingResults result={result} />;
  }

  return (
    <div className="border-2 border-dashed rounded-lg p-12 text-center">
      <input
        type="file"
        accept=".pdf,.png,.jpg"
        onChange={(e) => e.target.files?.[0] && handleFileDrop(e.target.files[0])}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <UploadIcon className="mx-auto w-16 h-16 text-gray-400 mb-4" />
        <p className="text-lg font-semibold">Arrastra tu documento aquí</p>
        <p className="text-sm text-gray-500 mt-2">
          La IA detectará el tipo de documento, extraerá los datos y generará el documento final automáticamente
        </p>
      </label>
    </div>
  );
}
```

### 11.2 Processing Results Page

**New Layout**:
```
┌────────────────────────────────────────────────────┐
│ Header: Document Type (auto-detected) ✓           │
│ Confidence: 98%                                    │
└────────────────────────────────────────────────────┘

┌─────────────────┬──────────────────────────────────┐
│ Client Context  │  Extracted Data (Filtered)       │
│ (CRM Sidebar)   │                                  │
│                 │  [Copy All] [Export]             │
│ 🟢 Fresh        │                                  │
│                 │  Razón Social: ABC SpA           │
│ ABC SpA         │  RUT: 12.345.678-9               │
│ RUT: 12.345.678-9│  Domicilio: ...                │
│                 │  ...                             │
│ Recent Cases:   │                                  │
│ - Case #123     │                                  │
│ - Case #456     │                                  │
│                 │                                  │
│ Documents: 15   │                                  │
└─────────────────┴──────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Generated Document Preview                         │
│                                                    │
│ [Template: Patent Application v2.1] ⭐⭐⭐⭐⭐      │
│                                                    │
│ SOLICITUD DE PATENTE DE INVENCIÓN                 │
│                                                    │
│ I. DATOS DEL SOLICITANTE                          │
│ Nombre/Razón Social: ABC SpA                      │
│ RUT: 12.345.678-9                                 │
│ ...                                               │
│                                                    │
│ [Download DOCX] [Download PDF] [Regenerate]      │
│                                                    │
│ Quality Score: 92% ✓                              │
│ ✓ All required fields filled                      │
│ ✓ No grammar errors                               │
│ ⚠ Minor: RUT format variation detected            │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Feedback                                           │
│                                                    │
│ ⭐⭐⭐⭐⭐ Rate this document                        │
│                                                    │
│ [Approve] [Regenerate with Instructions]          │
└────────────────────────────────────────────────────┘
```

### 11.3 New Components

**ClientContextSidebar** (see section 5.5)
**ExtractionBlockReview** (see section 6.4)
**DocumentPreview** (new):
```typescript
// components/DocumentPreview.tsx

interface DocumentPreviewProps {
  documentId: string;
  onApprove: () => void;
  onRegenerate: (instructions: string) => void;
}

export function DocumentPreview({
  documentId,
  onApprove,
  onRegenerate
}: DocumentPreviewProps) {
  const { document, loading } = useGeneratedDocument(documentId);
  const [showInstructions, setShowInstructions] = useState(false);

  if (loading) return <Skeleton />;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-lg">{document.template.name}</h3>
          <div className="flex items-center gap-4 mt-1">
            <Rating value={document.template.avg_user_rating} readonly />
            <span className="text-sm text-gray-500">
              Used {document.template.usage_count} times
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadDocument(documentId, 'docx')}>
            <DownloadIcon /> DOCX
          </Button>
          <Button variant="outline" onClick={() => downloadDocument(documentId, 'pdf')}>
            <DownloadIcon /> PDF
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        <DocumentRenderer content={document.generated_content} />
      </div>

      {/* Quality Check */}
      <div className="bg-gray-50 px-6 py-4 border-t">
        <QualityCheckSummary result={document.quality_check} />
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t flex justify-between items-center">
        <Rating
          value={0}
          onChange={(rating) => submitDocumentRating(documentId, rating)}
          label="Rate this document"
        />

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowInstructions(true)}
          >
            Regenerate
          </Button>
          <Button
            variant="primary"
            onClick={onApprove}
          >
            Approve Document
          </Button>
        </div>
      </div>

      {/* Regeneration Modal */}
      {showInstructions && (
        <RegenerateModal
          onClose={() => setShowInstructions(false)}
          onSubmit={(instructions) => {
            onRegenerate(instructions);
            setShowInstructions(false);
          }}
        />
      )}
    </div>
  );
}
```

---

## 12. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Week 1: Database & API Setup**
- [ ] Create new database tables (classification, CRM, filtering, templates)
- [ ] Set up migration scripts
- [ ] Create API endpoints (classification, CRM, filtering, templates)
- [ ] Set up ML service infrastructure (FastAPI skeleton)

**Week 2: Document Classification**
- [ ] Implement Bayesian optimizer for classification
- [ ] Implement rule-based classifier with feature extraction
- [ ] Create classification feedback API
- [ ] Add GPT-4 rule evolution (basic version)
- [ ] Test with existing documents (backfill)

**Week 3: CRM System**
- [ ] Implement client recognition logic
- [ ] Create CRM API endpoints
- [ ] Build client context sidebar component
- [ ] Implement data freshness calculation
- [ ] Add interaction tracking

**Week 4: Smart Extraction Filtering**
- [ ] Implement text block extraction from Textract
- [ ] Create rule-based filtering with Bayesian optimizer
- [ ] Build filtering feedback API
- [ ] Create ExtractionBlockReview component
- [ ] Add GPT-4 rule evolution for filtering

**Deliverable**: Core learning infrastructure + auto-classification + CRM + smart filtering

---

### Phase 2: Template System (Weeks 5-8)

**Week 5: Template Infrastructure**
- [ ] Design and implement template schema
- [ ] Build template storage and versioning
- [ ] Create template search API with Elasticsearch integration
- [ ] Implement template variable mapping logic

**Week 6: Template Selection AI**
- [ ] Implement Bayesian optimizer for template ranking
- [ ] Create template matching features
- [ ] Add GPT-4 template generation
- [ ] Build template approval workflow

**Week 7: Document Generation**
- [ ] Implement template filling engine
- [ ] Build DOCX renderer with `docx` library
- [ ] Add PDF conversion (LibreOffice or cloud service)
- [ ] Create quality checking system

**Week 8: Frontend Integration**
- [ ] Build template search UI
- [ ] Create DocumentPreview component
- [ ] Add regeneration workflow
- [ ] Implement feedback collection

**Deliverable**: End-to-end document generation from templates

---

### Phase 3: Deep Learning Models (Weeks 9-12)

**Week 9: Classification Deep Model**
- [ ] Collect 50+ samples per document type
- [ ] Train ResNet-50 + BERT classification model
- [ ] Integrate with ML service
- [ ] A/B test vs Bayesian approach

**Week 10: Filtering Deep Model**
- [ ] Collect 100+ text block corrections
- [ ] Train BiLSTM sequence classifier
- [ ] Integrate with filtering API
- [ ] Measure accuracy improvement

**Week 11: Template Matching Deep Model**
- [ ] Collect 50+ template selection feedbacks
- [ ] Train transformer-based matching model
- [ ] Integrate with template selection
- [ ] Compare against Bayesian ranker

**Week 12: Quality Prediction Model**
- [ ] Collect 100+ document ratings
- [ ] Train DNN quality predictor
- [ ] Integrate with document generation
- [ ] Use for pre-filtering generated documents

**Deliverable**: Phase 2 (slow learning) models deployed

---

### Phase 4: Polish & Optimization (Weeks 13-16)

**Week 13: Frontend Overhaul**
- [ ] Implement SmartFileUpload component
- [ ] Redesign ProcessingResults page
- [ ] Add LearningDashboard
- [ ] Polish animations and UX

**Week 14: Performance Optimization**
- [ ] Add caching (Redis) for ML predictions
- [ ] Optimize database queries (add indexes)
- [ ] Implement background job queue (Bull/Temporal)
- [ ] Reduce API latency

**Week 15: Testing & QA**
- [ ] End-to-end testing of full workflow
- [ ] Load testing (1000 documents)
- [ ] Security audit (RLS, authentication)
- [ ] Bug fixes

**Week 16: Launch Preparation**
- [ ] User training/documentation
- [ ] Deploy to production
- [ ] Monitor learning metrics
- [ ] Collect initial feedback

**Deliverable**: Production-ready system with full automation

---

### Post-Launch: Continuous Improvement

**Month 2-3: Data Collection**
- Collect 500+ documents across all types
- Gather user feedback on all components
- Monitor convergence metrics

**Month 4-6: Advanced Features**
- Multi-objective optimization (speed vs quality vs cost)
- Active learning (uncertainty sampling)
- Transfer learning from external legal datasets
- User-specific personalization

**Month 6+: Scaling**
- Multi-language support (extend to other Spanish-speaking countries)
- Add more document types (50+ types)
- Build marketplace for user-created templates
- API for third-party integrations

---

## 13. Success Metrics

### 13.1 Primary Metrics (User Experience)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Time to Final Document | 30-45 min | 2-3 min | Average time from upload to approval |
| Manual Interventions per Document | 8-10 | 0-1 | # of user corrections/inputs required |
| Document Approval Rate | N/A | 85%+ | % of documents approved without regeneration |
| User Satisfaction (NPS) | N/A | 50+ | Net Promoter Score survey |

### 13.2 Learning Metrics (System Performance)

| Component | Target Accuracy | Convergence Samples | Phase 2 Trigger |
|-----------|----------------|---------------------|-----------------|
| Document Classification | 95%+ | 30-50 | 50 samples |
| Extraction Filtering | 90%+ | 40-60 | 100 samples |
| Template Selection | 85%+ | 50-80 | 100 samples |
| Quality Prediction | 90%+ | 80-100 | 150 samples |

### 13.3 Business Metrics

| Metric | Target | Impact |
|--------|--------|--------|
| Documents Processed per Day | 50+ | Throughput |
| Cost per Document | <$0.50 | Profitability |
| Client Retention (6-month) | 90%+ | Stickiness |
| Template Library Size | 100+ | Value prop |

---

## 14. Risk Analysis

### 14.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Learning models converge slowly | Medium | High | Implement active learning; bootstrap with transfer learning |
| GPT-4 generates poor templates | Medium | Medium | Add approval workflow; collect user feedback; rollback mechanism |
| Classification accuracy plateau | Low | Medium | Add more features; try ensemble methods; collect more diverse data |
| DOCX rendering bugs | High | Low | Extensive testing; fallback to simple templates; user can edit |
| Performance degradation with scale | Medium | High | Add caching; optimize DB queries; implement job queue |

### 14.2 User Experience Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User doesn't trust AI-generated documents | High | High | Show confidence scores; allow easy editing; transparent explanations |
| Missing required fields in templates | Medium | Medium | Quality checks; ask user for missing info; validate before generation |
| CRM data becomes stale quickly | Medium | Medium | Auto-update on interactions; show freshness indicator; prompt user |
| Template doesn't match jurisdiction | Low | High | Validate jurisdiction; allow template customization; legal review |

### 14.3 Data Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Insufficient training data | Medium | High | Bootstrap with synthetic data; transfer learning; active sampling |
| Data quality issues (noisy feedback) | Medium | Medium | Add feedback validation; detect anomalies; weight by user reliability |
| Privacy concerns with CRM data | Low | High | Encryption at rest; RLS policies; user consent; GDPR compliance |
| Bias in classification/selection | Low | Medium | Monitor fairness metrics; diverse training set; bias detection |

---

## 15. Conclusion

This refactoring plan transforms Legislazuli from a **document extraction tool** into an **autonomous legal document processing system**. The key innovations are:

1. **Zero Manual Input**: AI handles document type detection, client recognition, noise filtering, and document generation autonomously
2. **Multi-Layer Learning**: Fast learning (Bayesian + GPT-4) achieves 85-95% accuracy quickly; slow learning (deep NNs) reaches 95-99% with more data
3. **Persistent Context**: CRM system maintains client relationships and data freshness, eliminating repetitive data entry
4. **End-to-End Automation**: From file upload to final formatted legal document in <3 minutes (95% time reduction)

**Expected Outcomes**:
- User time saved: **60-90 minutes → 2-3 minutes per document**
- Manual interventions: **8-10 → 0-1 per document**
- Accuracy: **Maintained at 100% with AI + human-in-the-loop approval**
- User satisfaction: **NPS 50+ (industry-leading)**

**Implementation Timeline**: 16 weeks to production launch, with continuous learning and improvement post-launch.

The system is designed to **learn from every interaction**, continuously improving classification, filtering, template selection, and document generation quality. After 6 months of operation with 500+ documents, the system will achieve near-autonomous operation with minimal user intervention.

---

## Appendix A: Technology Stack Summary

**Frontend**:
- Next.js 15 (React 18 + TypeScript)
- TailwindCSS
- Zustand (state management)

**Backend**:
- Next.js API Routes
- Supabase PostgreSQL
- Redis (caching)
- AWS Lambda (async processing)

**AI/ML**:
- Claude Sonnet 4 (extraction, GPT-4 alternative)
- GPT-4 (rule evolution, template generation)
- PyTorch (deep learning models)
- scikit-optimize (Bayesian optimization)
- AWS Textract (OCR)

**Document Generation**:
- `docx` library (DOCX rendering)
- LibreOffice (PDF conversion)
- Elasticsearch (template search)

**Infrastructure**:
- AWS S3 (storage)
- AWS Lambda (serverless functions)
- Python FastAPI (ML service)
- Bull/Temporal (job queue)

---

## Appendix B: File Structure

```
/legis
├── app/
│   ├── api/
│   │   ├── classify/
│   │   │   ├── route.ts
│   │   │   ├── feedback/route.ts
│   │   │   └── evolve/route.ts
│   │   ├── crm/
│   │   │   ├── clients/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── recognize/route.ts
│   │   │   └── link/route.ts
│   │   ├── filtering/
│   │   │   ├── blocks/route.ts
│   │   │   ├── feedback/route.ts
│   │   │   └── evolve/route.ts
│   │   ├── templates/
│   │   │   ├── search/route.ts
│   │   │   ├── generate/route.ts
│   │   │   └── [id]/route.ts
│   │   ├── generate/
│   │   │   ├── route.ts
│   │   │   ├── [id]/status/route.ts
│   │   │   └── feedback/route.ts
│   │   └── learning/
│   │       ├── metrics/route.ts
│   │       └── convergence/route.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── crm/
│   │   └── page.tsx
│   └── learning/
│       └── page.tsx
├── components/
│   ├── SmartFileUpload.tsx
│   ├── ProcessingResults.tsx
│   ├── ClientContextSidebar.tsx
│   ├── ExtractionBlockReview.tsx
│   ├── DocumentPreview.tsx
│   └── LearningDashboard.tsx
├── lib/
│   ├── classification/
│   │   ├── optimizer.ts
│   │   ├── features.ts
│   │   └── evolution.ts
│   ├── crm/
│   │   ├── client-recognition.ts
│   │   ├── freshness.ts
│   │   └── interactions.ts
│   ├── filtering/
│   │   ├── text-blocks.ts
│   │   ├── rules.ts
│   │   └── evolution.ts
│   ├── templates/
│   │   ├── selector.ts
│   │   ├── filler.ts
│   │   ├── renderer.ts
│   │   └── quality-checker.ts
│   └── learning/
│       ├── convergence.ts
│       ├── feedback.ts
│       └── metrics.ts
├── ml-service/
│   ├── classification/
│   │   ├── optimizer.py
│   │   ├── deep_classifier.py
│   │   └── features.py
│   ├── filtering/
│   │   ├── optimizer.py
│   │   ├── sequence_classifier.py
│   │   └── rules.py
│   ├── templates/
│   │   ├── selector.py
│   │   ├── matcher.py
│   │   └── quality_predictor.py
│   └── main.py
└── migrations/
    ├── 020_add_classification_tables.sql
    ├── 021_add_crm_tables.sql
    ├── 022_add_filtering_tables.sql
    ├── 023_add_template_tables.sql
    └── 024_add_learning_tables.sql
```

---

**End of Refactoring Plan**

This document should be reviewed by:
1. Technical Lead (architecture validation)
2. Product Manager (feature prioritization)
3. UX Designer (user flow validation)
4. Legal Expert (template requirements, compliance)

Next Steps:
1. Review and approve this plan
2. Create detailed task breakdown in project management tool
3. Set up development environment for ML service
4. Begin Phase 1 implementation
