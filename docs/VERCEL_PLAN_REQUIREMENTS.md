# Vercel Plan Requirements

## Current Configuration

Your application is currently configured for **Vercel Hobby Plan**:

- **Memory**: 1024 MB (Hobby max)
- **Function Timeout**: 10 seconds (Hobby max)

## Plan Comparison

| Feature | Hobby | Pro | Your Config |
|---------|-------|-----|-------------|
| Function Memory | Up to 1024 MB | Up to 3008 MB | **3008 MB** ⚠️ |
| Function Timeout | 10 seconds | 60 seconds | **60 seconds** ⚠️ |
| Concurrent Builds | 1 | 12 | - |
| Deployments/Day | 100 | 6000 | - |
| Build Time | 45 min | 45 min | ✅ |

## If You're on Hobby Plan

If you're experiencing deployment failures, you may need to:

1. **Upgrade to Pro Plan** (recommended for production)
   - Better performance with 60-second timeout
   - More memory for Chromium/PDF processing
   - 12 concurrent builds

2. **OR Adjust Configuration for Hobby** (not recommended for production)
   - Reduce memory to 1024 MB
   - Reduce timeout to 10 seconds
   - This may cause timeouts with heavy PDF processing

## Hobby-Compatible Configuration

If you must use Hobby plan, update `vercel.json`:

```json
{
  "functions": {
    "app/api/extract/route.ts": {
      "maxDuration": 10,
      "memory": 1024
    }
  }
}
```

**Warning**: With 10-second timeout, complex PDF extractions may timeout. Consider:
- Optimizing extraction logic
- Using smaller PDFs
- Implementing async processing
- Upgrading to Pro plan

## Checking Your Plan

1. Go to Vercel Dashboard → Settings → General
2. Check your plan under "Plan" section
3. If on Hobby, consider upgrading for better performance

