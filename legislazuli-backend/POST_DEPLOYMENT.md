# Post-Deployment Configuration

After deploying the SAM stack, you need to configure S3 bucket notifications and SNS triggers to complete the async pipeline setup.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Stack deployed successfully via `sam deploy`
- Note the output values from the deployment (especially `BucketName`, `StartAnalysisFunctionArn`, `ProcessResultsFunctionArn`, `SNSTopicArn`)

## Step 1: Get Stack Output Values

```bash
# Set your stack name and region
STACK_NAME="legislazuli-stack"
REGION="us-east-2"
AWS_PROFILE="legislazuli"  # or your AWS profile name

# Get all output values
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs' \
  --output table \
  --profile $AWS_PROFILE

# Get individual values
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

START_LAMBDA_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`StartAnalysisFunctionName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

PROCESS_LAMBDA_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ProcessResultsFunctionName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`SNSTopicArn`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

echo "Bucket: $BUCKET_NAME"
echo "Start Lambda: $START_LAMBDA_NAME"
echo "Process Lambda: $PROCESS_LAMBDA_NAME"
echo "SNS Topic: $SNS_TOPIC_ARN"
```

## Step 2: Configure S3 Bucket Notification

### 2.1 Add Lambda Permission for S3

Allow S3 to invoke the `StartAnalysisFunction` Lambda:

```bash
START_LAMBDA_ARN="arn:aws:lambda:${REGION}:$(aws sts get-caller-identity --query Account --output text --profile $AWS_PROFILE):function:${START_LAMBDA_NAME}"

aws lambda add-permission \
  --function-name $START_LAMBDA_NAME \
  --statement-id s3-trigger-permission \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::${BUCKET_NAME}" \
  --region $REGION \
  --profile $AWS_PROFILE
```

### 2.2 Create S3 Notification Configuration

Create a notification configuration file:

```bash
cat > /tmp/notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "${START_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "uploads/"
            }
          ]
        }
      }
    }
  ]
}
EOF
```

### 2.3 Apply S3 Notification Configuration

```bash
aws s3api put-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --notification-configuration file:///tmp/notification.json \
  --region $REGION \
  --profile $AWS_PROFILE
```

### 2.4 Verify S3 Notification

```bash
aws s3api get-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --profile $AWS_PROFILE
```

## Step 3: Configure SNS Trigger

### 3.1 Subscribe Lambda to SNS Topic

Subscribe the `ProcessResultsFunction` to the SNS topic:

```bash
aws sns subscribe \
  --topic-arn $SNS_TOPIC_ARN \
  --protocol lambda \
  --notification-endpoint "arn:aws:lambda:${REGION}:$(aws sts get-caller-identity --query Account --output text --profile $AWS_PROFILE):function:${PROCESS_LAMBDA_NAME}" \
  --region $REGION \
  --profile $AWS_PROFILE
```

### 3.2 Add Lambda Permission for SNS

Allow SNS to invoke the `ProcessResultsFunction` Lambda:

```bash
aws lambda add-permission \
  --function-name $PROCESS_LAMBDA_NAME \
  --statement-id sns-trigger-permission \
  --action lambda:InvokeFunction \
  --principal sns.amazonaws.com \
  --source-arn $SNS_TOPIC_ARN \
  --region $REGION \
  --profile $AWS_PROFILE
```

### 3.3 Verify SNS Subscription

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn $SNS_TOPIC_ARN \
  --region $REGION \
  --profile $AWS_PROFILE
```

## Step 4: Configure S3 Bucket Policy (Optional)

If you need to allow Textract to access the bucket (beyond IAM role permissions), add a bucket policy:

```bash
# Get Textract Service Role ARN
TEXTRACT_ROLE_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'StackResources[?LogicalResourceId==`TextractServiceRole`].PhysicalResourceId' \
  --output text \
  --profile $AWS_PROFILE)

TEXTRACT_ROLE_ARN=$(aws iam get-role \
  --role-name $TEXTRACT_ROLE_NAME \
  --region $REGION \
  --query 'Role.Arn' \
  --output text \
  --profile $AWS_PROFILE)

# Create bucket policy
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTextractAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${TEXTRACT_ROLE_ARN}"
      },
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    },
    {
      "Sid": "AllowTextractListBucket",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${TEXTRACT_ROLE_ARN}"
      },
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}"
    }
  ]
}
EOF

# Apply bucket policy (requires s3:PutBucketPolicy permission)
aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json \
  --region $REGION \
  --profile $AWS_PROFILE
```

**Note**: This step requires `s3:PutBucketPolicy` permission. If you don't have this permission, the IAM role permissions should be sufficient for Textract to access objects.

## Step 5: Update Vercel Environment Variables

Update your Vercel project with the new bucket name:

```bash
# Get the bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

echo "Update Vercel environment variable:"
echo "AWS_BUCKET_NAME=$BUCKET_NAME"
echo "AWS_S3_BUCKET_NAME=$BUCKET_NAME"
```

## Complete Setup Script

Here's a complete script that does all the above steps:

```bash
#!/bin/bash
set -e

# Configuration
STACK_NAME="legislazuli-stack"
REGION="us-east-2"
AWS_PROFILE="legislazuli"

echo "=== Post-Deployment Configuration ==="
echo ""

# Get stack outputs
echo "1. Getting stack outputs..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

START_LAMBDA_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`StartAnalysisFunctionName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

PROCESS_LAMBDA_NAME=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`ProcessResultsFunctionName`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`SNSTopicArn`].OutputValue' \
  --output text \
  --profile $AWS_PROFILE)

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile $AWS_PROFILE)

START_LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${START_LAMBDA_NAME}"
PROCESS_LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${PROCESS_LAMBDA_NAME}"

echo "✅ Stack outputs retrieved"
echo "   Bucket: $BUCKET_NAME"
echo "   Start Lambda: $START_LAMBDA_NAME"
echo "   Process Lambda: $PROCESS_LAMBDA_NAME"
echo ""

# Configure S3 notification
echo "2. Configuring S3 bucket notification..."
aws lambda add-permission \
  --function-name $START_LAMBDA_NAME \
  --statement-id s3-trigger-permission \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::${BUCKET_NAME}" \
  --region $REGION \
  --profile $AWS_PROFILE > /dev/null 2>&1 || echo "   Permission may already exist"

cat > /tmp/notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "${START_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "uploads/"
            }
          ]
        }
      }
    }
  ]
}
EOF

aws s3api put-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --notification-configuration file:///tmp/notification.json \
  --region $REGION \
  --profile $AWS_PROFILE

echo "✅ S3 notification configured"
echo ""

# Configure SNS trigger
echo "3. Configuring SNS trigger..."
aws sns subscribe \
  --topic-arn $SNS_TOPIC_ARN \
  --protocol lambda \
  --notification-endpoint $PROCESS_LAMBDA_ARN \
  --region $REGION \
  --profile $AWS_PROFILE > /dev/null 2>&1 || echo "   Subscription may already exist"

aws lambda add-permission \
  --function-name $PROCESS_LAMBDA_NAME \
  --statement-id sns-trigger-permission \
  --action lambda:InvokeFunction \
  --principal sns.amazonaws.com \
  --source-arn $SNS_TOPIC_ARN \
  --region $REGION \
  --profile $AWS_PROFILE > /dev/null 2>&1 || echo "   Permission may already exist"

echo "✅ SNS trigger configured"
echo ""

echo "=== Configuration Complete ==="
echo ""
echo "Pipeline is ready:"
echo "1. Upload to S3 (uploads/) → triggers StartAnalysisFunction"
echo "2. Textract completes → publishes to SNS"
echo "3. SNS → triggers ProcessResultsFunction"
echo "4. Results saved to DynamoDB"
echo ""
echo "Update Vercel environment variable:"
echo "AWS_BUCKET_NAME=$BUCKET_NAME"
```

Save this as `configure-pipeline.sh`, make it executable (`chmod +x configure-pipeline.sh`), and run it after deployment.

## Verification

After configuration, test the pipeline:

1. Upload a PDF to `s3://${BUCKET_NAME}/uploads/test.pdf`
2. Check CloudWatch logs for `StartAnalysisFunction` to see if it was triggered
3. Wait for Textract to complete (check Textract console or SNS topic)
4. Check CloudWatch logs for `ProcessResultsFunction` to see if results were processed
5. Check DynamoDB table `LegislazuliResults` for the final result

## Troubleshooting

### S3 Notification Not Triggering
- Verify the Lambda permission was added: `aws lambda get-policy --function-name $START_LAMBDA_NAME`
- Check S3 notification config: `aws s3api get-bucket-notification-configuration --bucket $BUCKET_NAME`
- Ensure objects are uploaded to `uploads/` prefix

### SNS Not Triggering ProcessResultsFunction
- Verify subscription exists: `aws sns list-subscriptions-by-topic --topic-arn $SNS_TOPIC_ARN`
- Check Lambda permission: `aws lambda get-policy --function-name $PROCESS_LAMBDA_NAME`
- Verify Textract is publishing to the correct SNS topic (check Textract job configuration)

### Textract Cannot Access S3 Objects
- Verify IAM role has S3 permissions: `aws iam get-role-policy --role-name $TEXTRACT_ROLE_NAME --policy-name TextractSNSPublish`
- Check bucket policy (if configured): `aws s3api get-bucket-policy --bucket $BUCKET_NAME`
- Ensure bucket name matches in Textract job configuration
