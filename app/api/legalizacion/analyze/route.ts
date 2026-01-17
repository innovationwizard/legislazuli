import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { extractTextFromDocument } from '@/lib/utils/textract';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extractedText = await extractTextFromDocument(buffer, file.type);

    return NextResponse.json({
      text: extractedText,
    });
  } catch (error: any) {
    console.error('Legalizacion analyze error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze document' },
      { status: 500 }
    );
  }
}
