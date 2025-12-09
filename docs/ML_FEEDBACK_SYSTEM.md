# ML Feedback System Documentation

## Overview

The ML Feedback System allows user "condor" to provide feedback on extraction accuracy, which automatically evolves prompts to improve performance. The system uses:

- **Feedback Collection**: Field-level accuracy feedback with "why" explanations
- **Prompt Versioning**: Versioned prompts stored as JSON in the database
- **Automatic Evolution**: LLM-based prompt evolution triggered by feedback
- **Backtesting**: Automatic testing of new prompt versions before activation

## Database Schema

Run the SQL migration script to create the required tables:

```bash
# Execute in Supabase SQL Editor
scripts/create-ml-feedback-schema.sql
```

Tables created:
- `extraction_feedback`: Stores field-level feedback
- `prompt_versions`: Stores versioned prompts with performance metrics
- `extraction_prompt_versions`: Tracks which prompt versions were used
- `prompt_evolution_queue`: Tracks feedback accumulation for evolution triggers

## Initialization

Before using the system, initialize prompt versions from current prompts:

```bash
# This creates version 1 for all document types and models
npx tsx scripts/initialize-prompt-versions.ts
```

## Usage

### 1. Providing Feedback (User "condor" only)

When viewing an extraction with discrepancies:

1. Navigate to the extraction detail page
2. For fields marked "⚠ Revisar", you'll see debug info showing Claude and OpenAI outputs
3. For each model output:
   - Click "✓ Correct" if the value is right
   - Click "✗ Wrong" if the value is wrong
   - If wrong, provide a "why" explanation (max 100 chars)
   - Click "Submit Feedback"

### 2. Automatic Evolution

The system automatically evolves prompts when:

- **First 50 feedbacks**: Evolves on ANY feedback with a "why" explanation
- **After 50 feedbacks**: Evolves based on error patterns and frequency

Evolution process:
1. Feedback is categorized (accent_error, numeric_error, ocr_error, etc.)
2. When threshold is reached, prompts are evolved using Claude
3. New versions are created (inactive)
4. Backtesting runs against reviewed extractions
5. If accuracy improves, new versions are activated

### 3. Manual Evolution Trigger

User "condor" can manually trigger evolution:

```bash
POST /api/evolution/trigger
{
  "doc_type": "patente_empresa",
  "model": "openai"
}
```

## API Endpoints

### Submit Feedback
```
POST /api/feedback
{
  "extraction_id": "uuid",
  "field_name": "Número de Patente",
  "model": "openai",
  "is_correct": false,
  "why": "Wrong digit: 6 vs 8"
}
```

### Get Feedback
```
GET /api/feedback?extraction_id=uuid
```

### Trigger Evolution
```
POST /api/evolution/trigger
{
  "doc_type": "patente_empresa",
  "model": "openai"
}
```

## Error Categories

Feedback is automatically categorized:
- `accent_error`: Missing or incorrect Spanish accents
- `numeric_error`: Wrong digits in numbers
- `ocr_error`: OCR/reading errors
- `formatting_error`: Format/structure issues
- `missing_field`: Field not extracted
- `extra_content`: Extra/unwanted content
- `other_error`: Other issues

## Prompt Evolution

Prompts evolve using Claude with:
- Current prompt versions
- Error category analysis
- Recent feedback examples
- Emphasis on accent preservation (legal requirement)

New versions are:
- Created with incremented version numbers
- Linked to parent versions
- Stored with evolution reasons
- Backtested before activation

## Backtesting

Backtesting:
- Uses reviewed extractions with feedback
- Compares new prompt results against known correct values
- Calculates accuracy score
- Activates if accuracy improves by at least 1%

## Integration

The system is integrated into the extraction flow:
- Active prompts are loaded automatically
- Prompt versions used are saved with each extraction
- Falls back to default prompts if no versions exist

## Legal Requirements

**CRITICAL**: Spanish accents (á, é, í, ó, ú, ñ, ü) MUST be preserved exactly. This is enforced in:
- Normalization functions (with warnings)
- Prompt evolution (explicit instructions)
- All extraction prompts

## Future Enhancements

- Bayesian optimization for prompt parameter tuning
- Deep reward learning for fine-tuning
- A/B testing between prompt versions
- Automated retraining on feedback accumulation

