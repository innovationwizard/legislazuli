/**
 * AWS S3 Client for Enterprise Async Architecture
 * Handles PDF uploads to S3 for Textract async processing
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || '';

if (!S3_BUCKET) {
  console.warn('AWS_S3_BUCKET_NAME not set. Async processing will not work.');
}

/**
 * Uploads a PDF buffer to S3
 * @param buffer - PDF file buffer
 * @param key - S3 object key (path)
 * @returns S3 object URL
 */
export async function uploadPdfToS3(
  buffer: Buffer,
  key: string
): Promise<{ bucket: string; key: string; url: string }> {
  if (!S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      // Optional: Add metadata
      Metadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    const url = `s3://${S3_BUCKET}/${key}`;

    return {
      bucket: S3_BUCKET,
      key,
      url,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload PDF to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deletes a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    // Don't throw - deletion is best effort cleanup
  }
}

/**
 * Generates a unique S3 key for a document
 * @param userId - User ID
 * @param documentId - Document ID
 * @param filename - Original filename
 * @returns S3 key path
 */
export function generateS3Key(userId: string, documentId: string, filename: string): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `textract-jobs/${userId}/${documentId}/${timestamp}_${sanitizedFilename}`;
}

