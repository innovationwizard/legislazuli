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

# Create CloudWatch log groups (if they don't exist)
echo "4. Creating CloudWatch log groups..."
aws logs create-log-group \
  --log-group-name "/aws/lambda/${START_LAMBDA_NAME}" \
  --region $REGION \
  --profile $AWS_PROFILE > /dev/null 2>&1 || echo "   Log group for StartAnalysisFunction may already exist"

aws logs create-log-group \
  --log-group-name "/aws/lambda/${PROCESS_LAMBDA_NAME}" \
  --region $REGION \
  --profile $AWS_PROFILE > /dev/null 2>&1 || echo "   Log group for ProcessResultsFunction may already exist"

echo "✅ CloudWatch log groups ready"
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

