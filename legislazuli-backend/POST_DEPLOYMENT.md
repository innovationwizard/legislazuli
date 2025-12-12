# Post-Deployment Configuration

After successfully deploying the SAM stack, you need to configure the S3 bucket notification to trigger the Lambda function.

## Steps

1. **Get the Lambda Function ARN**:
   ```bash
   AWS_PROFILE=legislazuli aws cloudformation describe-stacks \
     --stack-name legislazuli-stack \
     --region us-east-2 \
     --query 'Stacks[0].Outputs[?OutputKey==`StartAnalysisFunctionArn`].OutputValue' \
     --output text
   ```

2. **Get the S3 Bucket Name**:
   ```bash
   AWS_PROFILE=legislazuli aws cloudformation describe-stacks \
     --stack-name legislazuli-stack \
     --region us-east-2 \
     --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
     --output text
   ```

3. **Add Lambda Permission for S3**:
   ```bash
   FUNCTION_ARN=<from step 1>
   BUCKET_ARN=arn:aws:s3:::legislazuli-documents-524390297512
   
   AWS_PROFILE=legislazuli aws lambda add-permission \
     --function-name $FUNCTION_ARN \
     --principal s3.amazonaws.com \
     --action lambda:InvokeFunction \
     --source-arn $BUCKET_ARN \
     --statement-id s3-trigger-permission
   ```

4. **Configure S3 Bucket Notification**:
   Create `notification.json`:
   ```json
   {
     "LambdaFunctionConfigurations": [
       {
         "LambdaFunctionArn": "<FUNCTION_ARN>",
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
   AWS_PROFILE=legislazuli aws s3api put-bucket-notification-configuration \
     --bucket legislazuli-documents-524390297512 \
     --notification-configuration file://notification.json \
     --region us-east-2
   ```

