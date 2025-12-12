/**
 * Lambda handler that starts Textract analysis when a PDF is uploaded to S3
 * Triggered by S3 ObjectCreated event
 */

const { TextractClient, StartDocumentAnalysisCommand } = require("@aws-sdk/client-textract");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, HeadObjectCommand, GetBucketPolicyCommand, GetBucketEncryptionCommand } = require("@aws-sdk/client-s3");

// Explicitly set region - AWS_REGION is automatically provided by Lambda runtime
// But we ensure it's set to us-east-2 for consistency
const REGION = process.env.AWS_REGION || 'us-east-2';

// Enable debug logging
const textract = new TextractClient({
  region: REGION,
  logger: console,
});

const s3 = new S3Client({
  region: REGION,
  logger: console,
});

const dynamodb = new DynamoDBClient({
  region: REGION,
});

exports.handler = async (event) => {
  console.log('S3 event received:', JSON.stringify(event, null, 2));

  try {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    console.log(`Starting Textract analysis for: s3://${bucket}/${key}`);
    console.log(`Region: ${REGION}`);
    console.log(`Textract Role ARN: ${process.env.TEXTRACT_ROLE_ARN}`);
    console.log(`SNS Topic ARN: ${process.env.SNS_TOPIC_ARN}`);

    // Debug: Check if object exists and is accessible
    try {
      const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const headResponse = await s3.send(headCommand);
      console.log('Object metadata:', JSON.stringify({
        exists: true,
        contentType: headResponse.ContentType,
        contentLength: headResponse.ContentLength,
        lastModified: headResponse.LastModified,
        etag: headResponse.ETag,
      }, null, 2));
    } catch (s3Error) {
      console.error('Failed to access S3 object:', s3Error);
      throw new Error(`Cannot access S3 object: ${s3Error.message}`);
    }

    // Debug: Check bucket policy
    try {
      const policyCommand = new GetBucketPolicyCommand({ Bucket: bucket });
      const policyResponse = await s3.send(policyCommand);
      const policy = JSON.parse(policyResponse.Policy);
      console.log('Bucket policy:', JSON.stringify(policy, null, 2));
    } catch (policyError) {
      if (policyError.name === 'NoSuchBucketPolicy') {
        console.log('No bucket policy found (using IAM permissions only)');
      } else {
        console.warn('Could not retrieve bucket policy:', policyError.message);
      }
    }

    // Debug: Check encryption
    try {
      const encryptionCommand = new GetBucketEncryptionCommand({ Bucket: bucket });
      const encryptionResponse = await s3.send(encryptionCommand);
      console.log('Bucket encryption:', JSON.stringify(encryptionResponse, null, 2));
    } catch (encryptionError) {
      if (encryptionError.name === 'ServerSideEncryptionConfigurationNotFoundError') {
        console.log('No bucket encryption configured');
      } else {
        console.warn('Could not retrieve encryption config:', encryptionError.message);
      }
    }

    const command = new StartDocumentAnalysisCommand({
      DocumentLocation: { 
        S3Object: { 
          Bucket: bucket, 
          Name: key 
        } 
      },
      FeatureTypes: ["FORMS", "TABLES"],
      // CRITICAL: This enables the "Push" notification pattern
      NotificationChannel: {
        RoleArn: process.env.TEXTRACT_ROLE_ARN,
        SNSTopicArn: process.env.SNS_TOPIC_ARN
      },
      OutputConfig: {
        S3Bucket: bucket,
        S3Prefix: "processed/" // Textract will dump the raw JSON here automatically
      }
    });

    const response = await textract.send(command);
    
    if (!response.JobId) {
      throw new Error('No JobId returned from Textract');
    }

    const jobId = response.JobId;
    console.log(`Job Started: ${jobId}`);

    // Store initial record in DynamoDB with S3 key mapping
    // This allows the frontend to query by S3 key while the job is processing
    try {
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.RESULTS_TABLE_NAME || 'LegislazuliResults',
        Item: marshall({
          jobId,
          s3Key: key, // Store S3 key for querying
          s3Bucket: bucket,
          status: 'PROCESSING',
          createdAt: new Date().toISOString(),
        }),
      }));
      console.log(`Stored initial record for job ${jobId} with S3 key ${key}`);
    } catch (dbError) {
      console.error('Failed to store initial record in DynamoDB:', dbError);
      // Don't fail the entire operation if DynamoDB write fails
      // The process-results Lambda will create the record when it completes
    }
    
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        jobId,
        bucket,
        key
      })
    };
  } catch (err) {
    console.error('Error starting Textract analysis:', err);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to start Textract analysis',
        message: err.message,
        stack: err.stack
      })
    };
  }
};

