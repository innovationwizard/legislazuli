import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const db = new DynamoDBClient({
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

const TABLE_NAME = process.env.AWS_DYNAMODB_TABLE_NAME || 'LegislazuliResults';

/**
 * Polls DynamoDB for extraction job status
 * The key parameter can be either:
 * - S3 Key (used initially before Textract JobId is available)
 * - Textract JobId (stored as primary key in DynamoDB after processing starts)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Missing key parameter' },
        { status: 400 }
      );
    }

    if (!TABLE_NAME) {
      return NextResponse.json(
        { error: 'DynamoDB table not configured' },
        { status: 500 }
      );
    }

    // Query DynamoDB by jobId (primary key)
    // First try direct lookup by jobId (if key is a Textract JobId)
    let command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { 
        jobId: { S: key }
      },
    });

    let { Item } = await db.send(command);

    // If not found, try scanning for S3 key match
    // Note: This is less efficient - consider adding a GSI on s3Key for production
    if (!Item) {
      const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 's3Key = :s3Key',
        ExpressionAttributeValues: {
          ':s3Key': { S: key }
        },
        Limit: 1,
      });

      const scanResult = await db.send(scanCommand);
      if (scanResult.Items && scanResult.Items.length > 0) {
        Item = scanResult.Items[0];
      }
    }

    if (!Item) {
      // Job not found - still processing or hasn't started yet
      return NextResponse.json(
        { status: 'PROCESSING' },
        { status: 404 }
      );
    }

    // Unmarshall DynamoDB item to plain object
    const result = unmarshall(Item);

    // Map DynamoDB result to our ExtractionResult format
    return NextResponse.json({
      jobId: result.jobId,
      status: result.status === 'COMPLETED' ? 'COMPLETED' : 
              result.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
      gapDetected: result.gapDetected,
      gapAmount: result.gapAmount ? Number(result.gapAmount) : undefined,
      totalAmount: result.totalAmount ? Number(result.totalAmount) : undefined,
      immediateAvailability: result.immediateAvailability ? Number(result.immediateAvailability) : undefined,
      instrumentNumber: result.instrumentNumber,
      rawText: result.rawText,
      aiAnalysis: result.aiAnalysis,
      error: result.error,
      createdAt: result.createdAt,
    });
  } catch (error) {
    console.error('Status polling error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check job status',
        errorCode: 'STATUS_CHECK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

