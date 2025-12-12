/**
 * Lambda handler that starts Textract analysis when a PDF is uploaded to S3
 * Triggered by S3 ObjectCreated event
 */

const { TextractClient, StartDocumentAnalysisCommand } = require("@aws-sdk/client-textract");

const textract = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

exports.handler = async (event) => {
  console.log('S3 event received:', JSON.stringify(event, null, 2));

  try {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    console.log(`Starting Textract analysis for: s3://${bucket}/${key}`);

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

    console.log(`Job Started: ${response.JobId}`);
    
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        jobId: response.JobId,
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

