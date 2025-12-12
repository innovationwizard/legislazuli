import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: process.env.LEGISLAZULI_ACCESS_KEY && process.env.LEGISLAZULI_SECRET_KEY
    ? {
        accessKeyId: process.env.LEGISLAZULI_ACCESS_KEY,
        secretAccessKey: process.env.LEGISLAZULI_SECRET_KEY,
      }
    : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const S3_BUCKET = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || '';

/**
 * Generates a presigned URL for direct S3 upload
 * This bypasses Vercel's payload limits and timeout constraints
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!S3_BUCKET) {
      return NextResponse.json(
        { 
          error: 'S3 bucket not configured',
          errorCode: 'S3_NOT_CONFIGURED'
        },
        { status: 500 }
      );
    }

    const { filename, filetype } = await req.json();

    if (!filename || !filetype) {
      return NextResponse.json(
        { error: 'Missing filename or filetype' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(filetype)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Generate unique S3 key
    // Note: Must use 'uploads/' prefix to trigger Lambda (as configured in SAM template)
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${timestamp}-${sanitizedFilename}`;

    // Create presigned URL (valid for 60 seconds)
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: filetype,
      Metadata: {
        userId: session.user.id,
        uploadedAt: new Date().toISOString(),
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({
      uploadUrl,
      key,
      bucket: S3_BUCKET,
    });
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate upload URL',
        errorCode: 'UPLOAD_URL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

