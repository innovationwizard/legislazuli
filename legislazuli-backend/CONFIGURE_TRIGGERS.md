# Configure S3 and SNS Triggers

The stack is deployed, but we need to configure:
1. S3 bucket notification to trigger `StartAnalysisFunction`
2. SNS topic subscription to trigger `ProcessResultsFunction`

## Step 1: Get Function ARNs

```bash
# Get StartAnalysisFunction ARN
START_FUNCTION_ARN=$(AWS_PROFILE=legislazuli aws cloudformation describe-stacks \
  --stack-name legislazuli-stack \
  --region us-east-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`StartAnalysisFunctionArn`].OutputValue' \
  --output text)

# Get ProcessResultsFunction ARN  
PROCESS_FUNCTION_ARN=$(AWS_PROFILE=legislazuli aws lambda list-functions \
  --region us-east-2 \
  --query 'Functions[?contains(FunctionName, `ProcessResults`)].FunctionArn' \
  --output text)

# Get SNS Topic ARN
SNS_TOPIC_ARN=$(AWS_PROFILE=legislazuli aws cloudformation describe-stacks \
  --stack-name legislazuli-stack \
  --region us-east-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`SNSTopicArn`].OutputValue' \
  --output text)

# Get Bucket ARN
BUCKET_ARN="arn:aws:s3:::legislazuli-documents-524390297512"
BUCKET_NAME="legislazuli-documents-524390297512"

echo "Start Function: $START_FUNCTION_ARN"
echo "Process Function: $PROCESS_FUNCTION_ARN"
echo "SNS Topic: $SNS_TOPIC_ARN"
```

## Step 2: Add S3 Lambda Permission

```bash
AWS_PROFILE=legislazuli aws lambda add-permission \
  --function-name $START_FUNCTION_ARN \
  --principal s3.amazonaws.com \
  --action lambda:InvokeFunction \
  --source-arn $BUCKET_ARN \
  --statement-id s3-trigger-permission \
  --region us-east-2
```

## Step 3: Configure S3 Bucket Notification

Create `notification.json`:
```json
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "<START_FUNCTION_ARN>",
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
```

Then apply:
```bash
# Replace <START_FUNCTION_ARN> with actual ARN in notification.json first
AWS_PROFILE=legislazuli aws s3api put-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --notification-configuration file://notification.json \
  --region us-east-2
```

## Step 4: Subscribe ProcessResultsFunction to SNS Topic

```bash
AWS_PROFILE=legislazuli aws sns subscribe \
  --topic-arn $SNS_TOPIC_ARN \
  --protocol lambda \
  --notification-endpoint $PROCESS_FUNCTION_ARN \
  --region us-east-2
```

## Step 5: Add Lambda Permission for SNS

```bash
AWS_PROFILE=legislazuli aws lambda add-permission \
  --function-name $PROCESS_FUNCTION_ARN \
  --principal sns.amazonaws.com \
  --action lambda:InvokeFunction \
  --source-arn $SNS_TOPIC_ARN \
  --statement-id sns-trigger-permission \
  --region us-east-2
```

## Verify Configuration

```bash
# Check S3 notification
AWS_PROFILE=legislazuli aws s3api get-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --region us-east-2

# Check SNS subscriptions
AWS_PROFILE=legislazuli aws sns list-subscriptions-by-topic \
  --topic-arn $SNS_TOPIC_ARN \
  --region us-east-2
```

