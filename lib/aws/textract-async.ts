/**
 * AWS Textract Async Service
 * Uses StartDocumentAnalysis for large PDFs (decouples from HTTP response)
 */

import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  DocumentMetadata,
} from '@aws-sdk/client-textract';

const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || '';
const SNS_TOPIC_ARN = process.env.AWS_SNS_TOPIC_ARN || ''; // Optional: for webhooks

export interface TextractJobResult {
  jobId: string;
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  blocks?: any[];
  extractedText?: string;
  statusMessage?: string;
}

/**
 * Starts an async Textract analysis job for a PDF in S3
 * @param s3Bucket - S3 bucket name
 * @param s3Key - S3 object key
 * @returns Job ID
 */
export async function startDocumentAnalysis(
  s3Bucket: string,
  s3Key: string
): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  try {
    const command = new StartDocumentAnalysisCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: s3Bucket,
          Name: s3Key,
        },
      },
      FeatureTypes: ['FORMS', 'TABLES'], // Extract forms and tables for legal documents
      // Optional: Configure SNS topic for completion notifications
      ...(SNS_TOPIC_ARN && {
        NotificationChannel: {
          SNSTopicArn: SNS_TOPIC_ARN,
          RoleArn: process.env.AWS_SNS_ROLE_ARN, // IAM role that allows Textract to publish to SNS
        },
      }),
    });

    const response = await textractClient.send(command);

    if (!response.JobId) {
      throw new Error('No JobId returned from Textract');
    }

    return response.JobId;
  } catch (error) {
    console.error('Textract StartDocumentAnalysis error:', error);
    throw new Error(
      `Failed to start Textract analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets the status and results of a Textract async job
 * @param jobId - Textract Job ID
 * @returns Job status and results
 */
export async function getDocumentAnalysis(jobId: string): Promise<TextractJobResult> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  try {
    const command = new GetDocumentAnalysisCommand({
      JobId: jobId,
    });

    const response = await textractClient.send(command);

    const status = response.JobStatus as 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';

    let extractedText = '';
    if (status === 'SUCCEEDED' && response.Blocks) {
      // Extract text from blocks (same logic as sync API)
      const textBlocks: string[] = [];
      const blocks = response.Blocks
        .filter((block) => block.BlockType === 'LINE' && block.Text)
        .sort((a, b) => {
          const pageA = a.Page || 0;
          const pageB = b.Page || 0;
          if (pageA !== pageB) return pageA - pageB;

          const topA = a.Geometry?.BoundingBox?.Top || 0;
          const topB = b.Geometry?.BoundingBox?.Top || 0;
          return topA - topB;
        });

      for (const block of blocks) {
        if (block.Text) {
          textBlocks.push(block.Text);
        }
      }

      extractedText = textBlocks.join('\n');
    }

    return {
      jobId,
      status,
      blocks: response.Blocks,
      extractedText,
      statusMessage: response.StatusMessage,
    };
  } catch (error) {
    console.error('Textract GetDocumentAnalysis error:', error);
    throw new Error(
      `Failed to get Textract analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extracts text from Textract blocks (helper function)
 */
export function extractTextFromBlocks(blocks: any[]): string {
  const textBlocks: string[] = [];
  const sortedBlocks = blocks
    .filter((block) => block.BlockType === 'LINE' && block.Text)
    .sort((a, b) => {
      const pageA = a.Page || 0;
      const pageB = b.Page || 0;
      if (pageA !== pageB) return pageA - pageB;

      const topA = a.Geometry?.BoundingBox?.Top || 0;
      const topB = b.Geometry?.BoundingBox?.Top || 0;
      return topA - topB;
    });

  for (const block of sortedBlocks) {
    if (block.Text) {
      textBlocks.push(block.Text);
    }
  }

  return textBlocks.join('\n');
}

