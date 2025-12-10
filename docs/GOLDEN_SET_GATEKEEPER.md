# Golden Set Gatekeeper - Preventing Prompt Drift

## The Problem: "Catastrophic Forgetting"

Automated prompt evolution can over-optimize for specific edge cases (e.g., blurry, coffee-stained patents) and inadvertently "break" the prompt for standard, clean patents that worked perfectly before.

**Symptom**: Accuracy metric stays high on new documents, but silently drops on old document types.

## The Solution: Golden Set Regression Testing

The Golden Set acts as a **gatekeeper** that prevents prompt regression. New prompts are only promoted if they maintain or improve performance on a curated set of representative documents.

## How It Works

### 1. Define the Golden Set

Select 10-20 documents that represent the "Perfect Range" of inputs:

- **5 pristine, perfect PDFs** - Standard, clean documents
- **5 rotated/scanned images** - Documents that work correctly after orientation normalization
- **5 complex edge cases** - Previously solved challenging documents

### 2. Mark Documents as Golden Set

Run the migration to add the `is_golden_set` column:

```sql
-- Run scripts/add-golden-set-column.sql
```

Then mark documents in Supabase:

```sql
UPDATE documents 
SET is_golden_set = TRUE 
WHERE id IN ('doc-id-1', 'doc-id-2', ...);
```

### 3. Automatic Testing

When a prompt receives enough feedback to trigger evolution:

1. **Draft**: Generate the new, optimized prompt version
2. **Golden Set Test**: Run the new prompt against all Golden Set documents
3. **Compare**: 
   - If `New_Score >= Old_Score` on Golden Set → **Promote to Production**
   - If `New_Score < Old_Score` → **Reject** (flag for human review)

### 4. Dual Testing

The system performs **two tests** before promoting:

1. **Golden Set Test** (Regression Prevention)
   - Tests against curated representative documents
   - Must maintain or improve performance
   - Prevents catastrophic forgetting

2. **Regular Backtest** (Improvement Validation)
   - Tests against recent feedback data
   - Must show improvement over current prompts
   - Validates the evolution actually helps

**Both tests must pass** for a prompt to be promoted.

## Implementation Details

### Files

- `lib/ml/golden-set-tester.ts` - Golden Set testing logic
- `lib/ml/prompt-evolution.ts` - Integration with evolution system
- `scripts/add-golden-set-column.sql` - Database migration

### Key Functions

- `testGoldenSet()` - Tests prompts against Golden Set documents
- `comparePromptVersionsOnGoldenSet()` - Compares new vs current prompts
- `backtestWithGoldenSet()` - Orchestrates the dual testing process

### Logging

The system logs detailed information:

```
🧪 Testing new prompts against Golden Set for patente_empresa/claude...
✅ Golden Set test PASSED: 95.00% accuracy (+2.50% vs current)
✅ Promoted new prompt versions (Golden Set: 95.00%, Backtest: 92.30%)
```

Or if it fails:

```
❌ Golden Set test FAILED: 88.00% accuracy (-5.00% vs current)
   Failed documents: 2
   1. patent-001.pdf: 3 errors
   2. patent-002.pdf: 1 errors
   ⚠️  New prompts REJECTED - would cause regression on Golden Set
```

## Best Practices

1. **Curate Carefully**: Choose documents that represent your real-world distribution
2. **Update Periodically**: Add new edge cases as you encounter them
3. **Monitor Results**: Review failed documents to understand what broke
4. **Balance**: Don't make the Golden Set too large (performance) or too small (coverage)

## Example: Setting Up Your Golden Set

```sql
-- Mark 5 pristine PDFs
UPDATE documents 
SET is_golden_set = TRUE 
WHERE doc_type = 'patente_empresa' 
  AND filename LIKE '%.pdf'
  AND id IN (
    SELECT id FROM documents 
    WHERE confidence = 'full' 
    ORDER BY created_at DESC 
    LIMIT 5
  );

-- Mark 5 rotated/scanned images
UPDATE documents 
SET is_golden_set = TRUE 
WHERE doc_type = 'patente_empresa' 
  AND filename LIKE '%.png'
  AND id IN (
    SELECT id FROM documents 
    WHERE confidence = 'full' 
    ORDER BY created_at DESC 
    LIMIT 5 OFFSET 5
  );

-- Mark 5 complex edge cases (previously solved)
UPDATE documents 
SET is_golden_set = TRUE 
WHERE doc_type = 'patente_empresa' 
  AND id IN (
    SELECT id FROM documents 
    WHERE confidence = 'review_required' 
      AND discrepancies IS NOT NULL
    ORDER BY created_at DESC 
    LIMIT 5
  );
```

## Principal Note

> **Evolution requires Stability.** An unchecked ML loop is like a junior developer pushing code directly to production without tests. It fixes the bug in front of them but might bring down the login page. The Golden Set is your automated CI/CD pipeline for prompts.

