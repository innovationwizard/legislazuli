# Legislazuli Async Processing Backend

This directory contains the AWS infrastructure code for the async PDF processing pipeline.

## Architecture

The pipeline follows an event-driven architecture:

1. **Frontend** → Requests presigned URL from Next.js `/api/upload`
2. **Frontend** → Uploads PDF directly to S3 (bypasses Vercel limits)
3. **S3** → Triggers `StartAnalysisFunction` Lambda on upload
4. **Lambda** → Starts Textract `StartDocumentAnalysis` (async job)
5. **Textract** → Completes analysis and publishes to SNS Topic
6. **SNS** → Triggers `ProcessResultsFunction` Lambda
7. **Lambda** → Fetches results, parses data, saves to DynamoDB/Postgres

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **SAM CLI** installed:
   ```bash
   brew install aws-sam-cli  # macOS
   # or
   pip install aws-sam-cli   # Linux/Windows
   ```
3. **Node.js 20.x** (for local testing)

## Deployment

### 1. Build the SAM application

```bash
cd legislazuli-backend
sam build
```

### 2. Deploy to AWS

```bash
sam deploy --guided
```

During guided deployment, you'll be prompted for:
- **Stack Name**: `legislazuli-stack` (or your preferred name)
- **AWS Region**: `us-east-2`
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Disable rollback**: `N` (recommended)

### 3. Get Output Values

After deployment, note the output values:
- `BucketName`: The S3 bucket name (set this as `AWS_S3_BUCKET_NAME` in Vercel)
- `SNSTopicArn`: The SNS topic ARN (set this as `AWS_SNS_TOPIC_ARN` in Vercel)

### 4. Enable Bedrock Model Access

**IMPORTANT**: Before deploying, you must enable Claude 3.5 Sonnet in Bedrock:

1. Go to AWS Console → **Bedrock** → **Model access**
2. Find **"Anthropic Claude 3.5 Sonnet"**
3. Click **"Request model access"** and wait for approval (usually instant)

Without this step, the Lambda function will fail when trying to invoke Bedrock.

### 5. Configure Vercel Environment Variables

Add these to your Vercel project:

```
AWS_S3_BUCKET_NAME=<BucketName from outputs>
AWS_SNS_TOPIC_ARN=<SNSTopicArn from outputs>
AWS_SNS_ROLE_ARN=<arn:aws:iam::ACCOUNT_ID:role/legislazuli-stack-TextractServiceRole-XXXXX>
```

## Local Testing

### Test Lambda Functions Locally

```bash
# Test start-analysis function
sam local invoke StartAnalysisFunction -e events/s3-upload-event.json

# Test process-results function
sam local invoke ProcessResultsFunction -e events/sns-event.json
```

## S3 CORS Configuration

The SAM template configures CORS for the S3 bucket, but you may need to restrict `AllowedOrigins` to your Vercel domain in production:

```yaml
AllowedOrigins: ['https://your-app.vercel.app', 'http://localhost:3000']
```

## IAM Roles

The template creates:
1. **TextractServiceRole**: Allows Textract to publish to SNS
2. **Lambda Execution Roles**: Auto-created by SAM with necessary permissions

## Monitoring

Check CloudWatch Logs for:
- `/aws/lambda/legislazuli-stack-StartAnalysisFunction`
- `/aws/lambda/legislazuli-stack-ProcessResultsFunction`

## Troubleshooting

### S3 Bucket Not Found
- Verify `AWS_S3_BUCKET_NAME` matches the bucket name from SAM outputs
- Check AWS region matches between Vercel env vars and SAM deployment

### Textract Job Not Starting
- Check CloudWatch logs for `StartAnalysisFunction`
- Verify S3 bucket notification configuration
- Ensure Lambda has `textract:StartDocumentAnalysis` permission

### Results Not Processing
- Check SNS topic subscription in AWS Console
- Verify `ProcessResultsFunction` is subscribed to the SNS topic
- Check CloudWatch logs for errors

## Cost Estimation

- **S3**: ~$0.023 per GB stored, $0.005 per 1,000 requests
- **Lambda**: Free tier: 1M requests/month, then $0.20 per 1M requests
- **Textract**: $1.50 per 1,000 pages (async analysis)
- **DynamoDB**: Free tier: 25GB storage, then $0.25 per GB/month
- **SNS**: $0.50 per 1M requests

For a typical workload (100 PDFs/month, ~10 pages each):
- **Estimated monthly cost**: ~$1.50 - $3.00

