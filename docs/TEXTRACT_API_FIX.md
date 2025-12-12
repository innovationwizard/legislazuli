# Textract API Fix - Critical Mime-Type Logic Correction

## Problem Identified

The application had a **Mime-Type Logic Failure** in the primary ingestion pipeline:

1. **Wrong API for PDFs**: Code was using `DetectDocumentTextCommand` for PDFs, but this API only accepts images (JPEG/PNG)
2. **Chromium Binary Tree-Shaking**: The Chromium binary was being removed during Vercel build process

## Solution Implemented

### 1. Fixed Textract API Routing

**File: `lib/utils/textract.ts`**
- Changed from `DetectDocumentTextCommand` to `AnalyzeDocumentCommand` for PDFs
- `AnalyzeDocumentCommand` properly supports multi-page PDFs
- Added `FeatureTypes: ['FORMS', 'TABLES']` for better legal document analysis

**File: `lib/utils/normalize-orientation.ts`**
- Updated to use `AnalyzeDocumentCommand` for PDFs in orientation detection
- Keeps `DetectDocumentTextCommand` for images (faster/cheaper)
- Both response types are now properly handled

**File: `lib/verification/textract-verifier.ts`**
- Updated to accept both `DetectDocumentTextCommandOutput` and `AnalyzeDocumentCommandOutput`
- Both APIs return the same `Blocks` structure, so verification works seamlessly

### 2. Fixed Chromium Binary Preservation

**File: `next.config.js`**
- Removed the `.node` file ignore rule that was stripping Chromium binaries
- `serverComponentsExternalPackages` already properly excludes Chromium from bundling
- This ensures the binary survives the Vercel Lambda build process

## API Usage Summary

| File Type | API Used | Reason |
|-----------|----------|--------|
| PDF | `AnalyzeDocumentCommand` | Supports multi-page PDFs, forms, and tables |
| Images (JPEG/PNG) | `DetectDocumentTextCommand` | Faster and cheaper for simple images |

## Important Notes

### Hobby Plan Limitations

- **Timeout**: 10 seconds (may timeout on large/complex PDFs)
- **Memory**: 1024 MB (may be insufficient for Chromium fallback)
- **Recommendation**: Upgrade to Pro plan (60s timeout, 3008 MB memory) for production

### Enterprise Architecture Consideration

For production systems processing 30+ page legal documents:

1. **Upload PDF to S3**
2. **Trigger `StartDocumentAnalysis` (Async API)** via S3 Event
3. **Poll/Webhook** for JSON result

This decouples heavy processing from the HTTP response loop and prevents timeouts.

## Testing

After deployment, verify:
- ✅ PDFs are processed using `AnalyzeDocumentCommand`
- ✅ Images are processed using `DetectDocumentTextCommand`
- ✅ Chromium fallback works when Textract fails
- ✅ Textract verification works with both API response types

