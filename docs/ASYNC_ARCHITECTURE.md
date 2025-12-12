# Enterprise Async Architecture

## Overview

For large PDFs (>1MB), the system uses an asynchronous processing pipeline that decouples heavy Textract processing from the HTTP response loop. This prevents timeouts and allows processing of 30+ page legal documents.

The frontend automatically detects async processing and shows a progress tracker with real-time status updates.

## Architecture Flow

```
1. User uploads PDF (>1MB)
   ↓
2. Upload PDF to S3
   ↓
3. Start Textract async job (StartDocumentAnalysis)
   ↓
4. Return job ID immediately (202 Accepted)
   ↓
5. Frontend shows JobStatus component with progress bar
   ↓
6. Frontend polls /api/jobs/[id]/status every 3 seconds
   ↓
7. AWS Textract completes → SNS webhook → /api/textract/webhook
   ↓
8. Webhook triggers LLM processing
   ↓
9. Job status updates to COMPLETED
   ↓
10. Frontend auto-redirects to results page
```

## Components

### 1. Database Schema

**Tables:**
- `textract_jobs` - Tracks Textract async jobs
- `extraction_jobs` - Tracks full extraction pipeline (Textract + LLM)

See `scripts/create-async-jobs-schema.sql` for schema.

### 2. S3 Upload (`lib/aws/s3.ts`)

Uploads PDFs to S3 for Textract processing.

**Environment Variables:**
- `AWS_S3_BUCKET_NAME` - S3 bucket name (required)

### 3. Async Textract Service (`lib/aws/textract-async.ts`)

- `startDocumentAnalysis()` - Starts async Textract job
- `getDocumentAnalysis()` - Gets job status and results

**Environment Variables:**
- `AWS_SNS_TOPIC_ARN` - (Optional) SNS topic for webhooks
- `AWS_SNS_ROLE_ARN` - (Optional) IAM role for SNS

### 4. Webhook Endpoint (`app/api/textract/webhook/route.ts`)

Receives SNS notifications when Textract completes.

**Setup:**
1. Create SNS Topic in AWS
2. Subscribe this endpoint URL to the topic
3. Configure Textract to send notifications to SNS

### 5. Job Status API (`app/api/jobs/[id]/status/route.ts`)

Frontend polls this endpoint to check job status.

**Response:**
```json
{
  "id": "job-uuid",
  "status": "PROCESSING_TEXTTRACT" | "PROCESSING_LLM" | "COMPLETED" | "FAILED",
  "statusMessage": "Textract analysis in progress...",
  "textractStatus": "IN_PROGRESS" | "SUCCEEDED" | "FAILED",
  "extractionId": "extraction-uuid",
  "fields": [...],
  "createdAt": "2025-12-12T...",
  "completedAt": "2025-12-12T..."
}
```

### 6. Extraction Processor (`lib/jobs/extraction-processor.ts`)

Processes Textract results through LLM extraction pipeline.

## Configuration

### Environment Variables

```bash
# Required for async processing
AWS_S3_BUCKET_NAME=your-bucket-name

# Optional: For webhook notifications
AWS_SNS_TOPIC_ARN=arn:aws:sns:region:account:topic-name
AWS_SNS_ROLE_ARN=arn:aws:iam::account:role/textract-sns-role
```

### AWS Setup

1. **Create S3 Bucket:**
   ```bash
   aws s3 mb s3://your-bucket-name
   ```

2. **Create SNS Topic (Optional):**
   ```bash
   aws sns create-topic --name textract-completion
   ```

3. **Configure SNS Subscription:**
   - Subscribe webhook URL: `https://your-domain.com/api/textract/webhook`
   - Protocol: HTTPS

4. **IAM Permissions:**
   - Lambda/API needs: `s3:PutObject`, `textract:StartDocumentAnalysis`, `textract:GetDocumentAnalysis`
   - Textract needs: `sns:Publish` (if using SNS)

## Usage

### Frontend Integration

The frontend automatically handles async processing. The `JobStatus` component manages polling and progress display.

**Dashboard (`app/(dashboard)/dashboard/page.tsx`):**
- Detects 202 Accepted responses
- Shows `JobStatus` component for async jobs
- Auto-redirects when complete

**JobStatus Component (`components/JobStatus.tsx`):**
- Polls `/api/jobs/[id]/status` every 3 seconds
- Shows progress bar (0-100%)
- Displays status messages
- Handles errors gracefully
- Auto-redirects to results when complete

**Manual Integration (if needed):**

```typescript
// Upload file
const response = await fetch('/api/extract', {
  method: 'POST',
  body: formData,
});

if (response.status === 202) {
  // Async processing
  const { jobId } = await response.json();
  
  // Use JobStatus component
  <JobStatus 
    jobId={jobId} 
    onComplete={(extractionId) => router.push(`/extraction/${extractionId}`)}
    onError={(error) => alert(error)}
  />
} else {
  // Synchronous processing (small files)
  const result = await response.json();
  router.push(`/extraction/${result.extraction_id}`);
}
```

## Thresholds

- **Async Processing**: PDFs > 1MB
- **Sync Processing**: PDFs ≤ 1MB or images

## Benefits

1. **No Timeouts**: Heavy processing happens asynchronously
2. **Scalability**: Can process 30+ page documents
3. **Reliability**: S3 + Textract async is more reliable than sync API
4. **User Experience**: Immediate response, progress tracking

## Frontend Components

### JobStatus Component

The `JobStatus` component provides:
- **Progress Bar**: Visual progress indicator (0-100%)
- **Status Messages**: Real-time status updates
- **Textract Status**: Shows Textract processing state
- **Error Handling**: Displays errors clearly
- **Auto-redirect**: Automatically navigates to results when complete

### User Experience

**Small Files (≤1MB):**
- Upload → Immediate processing → Redirect to results

**Large Files (>1MB):**
- Upload → Shows "Processing asynchronously..." → JobStatus component appears
- Progress bar shows: Pending (10%) → Textract (40%) → LLM (80%) → Completed (100%)
- Auto-redirects to results when done
- User can cancel and go back

## Fallback

If async setup fails (S3 not configured, etc.), the system falls back to synchronous processing.

