# Vercel Environment Variables

Add these environment variables to your Vercel project settings:

## Required Environment Variables

```
AWS_S3_BUCKET_NAME=legislazuli-documents-524390297512
AWS_SNS_TOPIC_ARN=arn:aws:sns:us-east-2:524390297512:legislazuli-stack-TextractCompleteTopic-Ww8c0V1YmvOZ
AWS_SNS_ROLE_ARN=arn:aws:iam::524390297512:role/legislazuli-stack-TextractServiceRole-rwNclElN7t3G
AWS_REGION=us-east-2
```

## Optional (if not using default AWS credentials)

```
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
```

## How to Add in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable above
4. Select the environments (Production, Preview, Development) where they should apply
5. Redeploy your application

## Verification

After adding the variables, your `/api/extract` endpoint will be able to:
- Upload large PDFs directly to S3 using presigned URLs
- Start async Textract jobs for files > 1MB
- The Lambda functions will process results automatically

