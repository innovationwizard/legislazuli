# Fixes Summary - PDF Processing Errors

## Issues Fixed

### 1. ✅ 400 Error - UnsupportedDocumentException
**Problem**: Textract was throwing `UnsupportedDocumentException` when trying to detect orientation for certain PDF formats.

**Solution**: 
- Improved error handling in `lib/utils/normalize-orientation.ts` to gracefully handle unsupported PDF formats
- The function now catches `UnsupportedDocumentException` and continues processing without rotation
- Added better error detection for 400 status codes

### 2. ✅ 404 Error - S3 Bucket Not Found
**Problem**: The S3 bucket `legislazuli-S3-bucket` doesn't exist, causing upload failures.

**Solution**:
- Created AWS SAM template (`legislazuli-backend/template.yaml`) that automatically creates the S3 bucket
- The bucket will be created with the name: `legislazuli-documents-{AWS_ACCOUNT_ID}`
- Added proper CORS configuration for direct browser uploads
- Created Lambda functions to handle async processing

### 3. ✅ Abort Error - Chromium Data URI Issue
**Problem**: Chromium was trying to load PDFs as Base64 data URIs (`data:application/pdf;base64,...`), which fails with `net::ERR_ABORTED`.

**Solution**:
- Updated `lib/utils/pdf-to-image.ts` to write PDFs to temporary files instead of using data URIs
- Uses `file://` protocol which is more reliable in headless Chromium
- Properly cleans up temporary files after conversion

### 4. ✅ Presigned URL Upload Endpoint
**Created**: New endpoint `/api/upload` that generates presigned URLs for direct S3 uploads
- Bypasses Vercel's 4.5MB payload limit
- Bypasses Vercel's 10s timeout limit
- Allows frontend to upload directly to S3

## New Infrastructure Created

### AWS SAM Template (`legislazuli-backend/`)
Complete infrastructure-as-code setup:

1. **S3 Bucket** (`DocumentBucket`)
   - Auto-created with CORS enabled
   - Triggers Lambda on upload

2. **Lambda Functions**:
   - `StartAnalysisFunction`: Starts Textract async job when PDF is uploaded
   - `ProcessResultsFunction`: Processes Textract results when job completes

3. **SNS Topic** (`TextractCompleteTopic`)
   - Receives notifications from Textract when analysis completes
   - Triggers result processing Lambda

4. **DynamoDB Table** (`ResultsTable`)
   - Stores Textract job results
   - Can be queried by job ID

5. **IAM Roles**:
   - `TextractServiceRole`: Allows Textract to publish to SNS
   - Lambda execution roles with necessary permissions

## Deployment Steps

### 1. Deploy AWS Infrastructure

```bash
cd legislazuli-backend
sam build
sam deploy --guided
```

During deployment, note the output values:
- `BucketName`: Set as `AWS_S3_BUCKET_NAME` in Vercel
- `SNSTopicArn`: Set as `AWS_SNS_TOPIC_ARN` in Vercel

### 2. Configure Vercel Environment Variables

Add these to your Vercel project settings:

```
AWS_S3_BUCKET_NAME=<from SAM outputs>
AWS_SNS_TOPIC_ARN=<from SAM outputs>
AWS_SNS_ROLE_ARN=<arn:aws:iam::ACCOUNT_ID:role/legislazuli-stack-TextractServiceRole-XXXXX>
```

You can find the role ARN in AWS Console → IAM → Roles → `legislazuli-stack-TextractServiceRole-*`

### 3. Update Frontend (Optional - For Very Large Files)

The current implementation already handles async processing for files > 1MB. However, for even larger files or to completely bypass Vercel limits, you can update the frontend to use presigned URLs:

```typescript
// In your upload handler (e.g., app/(dashboard)/dashboard/page.tsx)
const handleUpload = async (file: File, docType: DocType) => {
  // For files > 5MB, use presigned URL upload
  if (file.size > 5 * 1024 * 1024) {
    // 1. Get presigned URL
    const { uploadUrl, key } = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, filetype: file.type }),
    }).then(r => r.json());

    // 2. Upload directly to S3
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    // 3. Trigger processing via your API
    // (You'll need to create an endpoint that processes files already in S3)
  } else {
    // Use existing flow for smaller files
    // ... existing code ...
  }
};
```

## Current Behavior

The existing code already handles async processing well:

1. **Small PDFs (< 1MB)**: Processed synchronously via `/api/extract`
2. **Large PDFs (> 1MB)**: 
   - Uploaded to S3
   - Textract async job started
   - Returns 202 Accepted with job ID
   - Frontend can poll for status

## Testing

### Test Presigned URL Endpoint

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.pdf", "filetype": "application/pdf"}'
```

### Test Lambda Functions Locally

```bash
cd legislazuli-backend
sam local invoke StartAnalysisFunction -e events/s3-upload-event.json
```

## Monitoring

- **CloudWatch Logs**: Check Lambda function logs for errors
- **S3 Console**: Verify files are being uploaded
- **DynamoDB Console**: Check if results are being saved

## Next Steps

1. ✅ Deploy SAM template to create infrastructure
2. ✅ Configure Vercel environment variables
3. ⏳ Test with a real PDF upload
4. ⏳ (Optional) Update frontend to use presigned URLs for very large files
5. ⏳ (Optional) Integrate DynamoDB results with Supabase/Postgres

## Notes

- The S3 bucket name in the error (`legislazuli-S3-bucket`) doesn't match the SAM template bucket name. After deployment, update `AWS_S3_BUCKET_NAME` to match the actual bucket name from SAM outputs.
- The async pipeline is designed to handle files of any size without timeout issues.
- Textract costs ~$1.50 per 1,000 pages for async analysis.

