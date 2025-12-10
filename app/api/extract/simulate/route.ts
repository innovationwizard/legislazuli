import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { normalizeDocumentOrientation } from '@/lib/utils/normalize-orientation';
import { extractWithClaude, extractWithClaudeFromText } from '@/lib/ai/claude';
import { extractWithGemini, extractWithGeminiFromText } from '@/lib/ai/gemini';
import { getPromptVersionById } from '@/lib/ml/prompt-versioning';
import { convertPdfToImage } from '@/lib/utils/pdf-to-image';
import { extractTextFromPdf } from '@/lib/utils/textract';
import { TextractClient } from '@aws-sdk/client-textract';

// Vercel Serverless Timeout Configuration
// Simulation performs heavy operations: Textract, LLM inference, etc.
// Set to maximum allowed duration to prevent 504 Gateway Timeout errors
export const maxDuration = 60; // 60 seconds (Vercel Pro plan max, Hobby is 10s)
export const dynamic = 'force-dynamic'; // Prevent static caching

/**
 * POST /api/extract/simulate
 * Simulation mode: Extract using a specific prompt version instead of active prompts
 * Only accessible to "condor" user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can use simulation mode
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can use simulation mode' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const systemPromptVersionId = formData.get('systemPromptVersionId') as string;
    const userPromptVersionId = formData.get('userPromptVersionId') as string;
    const modelProvider = formData.get('modelProvider') as 'claude' | 'gemini';

    if (!file || !systemPromptVersionId || !userPromptVersionId || !modelProvider) {
      return NextResponse.json({ error: 'Missing required fields: file, systemPromptVersionId, userPromptVersionId, modelProvider' }, { status: 400 });
    }

    // Fetch the specific prompt versions
    const systemPromptVersion = await getPromptVersionById(systemPromptVersionId);
    const userPromptVersion = await getPromptVersionById(userPromptVersionId);

    if (!systemPromptVersion || !userPromptVersion) {
      return NextResponse.json({ error: 'One or both prompt versions not found' }, { status: 404 });
    }

    // Verify prompts match the model provider
    if (systemPromptVersion.model !== modelProvider || userPromptVersion.model !== modelProvider) {
      return NextResponse.json({ error: 'Prompt versions do not match the specified model provider' }, { status: 400 });
    }

    // Get file buffer
    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Normalize document orientation
    let processedBuffer = buffer;
    let textractText: string | null = null;
    try {
      const textractClient = new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
      });

      const orientationResult = await normalizeDocumentOrientation(
        buffer,
        textractClient,
        file.type
      );
      processedBuffer = Buffer.from(orientationResult.buffer);

      // Extract text for PDFs
      if (file.type === 'application/pdf') {
        textractText = await extractTextFromPdf(processedBuffer);
      }
    } catch (normalizationError) {
      console.warn('Orientation normalization failed, using original document:', normalizationError);
      processedBuffer = buffer;
    }

    // Convert to base64 image if needed
    let imageBase64: string;
    if (file.type === 'application/pdf') {
      // Convert PDF to image
      imageBase64 = await convertPdfToImage(processedBuffer);
    } else {
      // Convert image buffer to base64
      imageBase64 = processedBuffer.toString('base64');
    }

    // Prepare prompt overrides
    const promptOverrides = {
      systemPrompt: systemPromptVersion.prompt_content,
      userPrompt: userPromptVersion.prompt_content,
    };

    // Run extraction with overridden prompts
    let result;
    if (textractText && textractText.trim().length > 0) {
      // Use text extraction if available (for PDFs)
      if (modelProvider === 'claude') {
        result = await extractWithClaudeFromText(textractText, promptOverrides);
      } else {
        result = await extractWithGeminiFromText(textractText, promptOverrides);
      }
    } else {
      // Use image extraction
      if (modelProvider === 'claude') {
        result = await extractWithClaude(imageBase64, promptOverrides);
      } else {
        result = await extractWithGemini(imageBase64, promptOverrides);
      }
    }

    return NextResponse.json({
      result,
      usedPrompts: {
        system: {
          id: systemPromptVersion.id,
          version_number: systemPromptVersion.version_number,
          content: systemPromptVersion.prompt_content,
        },
        user: {
          id: userPromptVersion.id,
          version_number: userPromptVersion.version_number,
          content: userPromptVersion.prompt_content,
        },
      },
    });
  } catch (error: any) {
    console.error('Simulation extraction error:', error);
    return NextResponse.json({ error: error.message || 'Simulation extraction failed' }, { status: 500 });
  }
}

