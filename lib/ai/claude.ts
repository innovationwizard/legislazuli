import Anthropic from '@anthropic-ai/sdk';
import { 
  EXTRACTION_SYSTEM_PROMPT, 
  EXTRACTION_USER_PROMPT,
  DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
  DOCUMENT_TYPE_DETECTION_USER_PROMPT,
  FULL_TEXT_EXTRACTION_SYSTEM_PROMPT,
  FULL_TEXT_EXTRACTION_USER_PROMPT
} from './prompts';
import { RawExtractionFields } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Extract structured data from an image using Claude vision API
 */
export async function extractWithClaude(imageBase64: string): Promise<RawExtractionFields> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    const base64Data = imageBase64.split(',')[1] || imageBase64; // Remove data URL prefix if present

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_USER_PROMPT,
            },
          ],
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response
    const text = responseContent.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('Claude extraction error:', error);
    throw error;
  }
}

/**
 * Extract structured data from text using Claude
 * Used when PDF text is extracted via AWS Textract
 */
export async function extractWithClaudeFromText(text: string): Promise<RawExtractionFields> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_USER_PROMPT}\n\nDocument text:\n${text}`,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response
    const responseText = responseContent.text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('Claude text extraction error:', error);
    throw error;
  }
}

/**
 * Detect document type from an image using Claude
 */
export async function detectDocumentTypeWithClaude(imageBase64: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: DOCUMENT_TYPE_DETECTION_USER_PROMPT,
            },
          ],
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const text = responseContent.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('Claude document type detection error:', error);
    throw error;
  }
}

/**
 * Detect document type from text using Claude
 */
export async function detectDocumentTypeWithClaudeFromText(text: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${DOCUMENT_TYPE_DETECTION_USER_PROMPT}\n\nDocument text:\n${text}`,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const textResponse = responseContent.text;
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('Claude document type detection error:', error);
    throw error;
  }
}

/**
 * Extract full text from document using Claude (for "Otros" type)
 */
export async function extractFullTextWithClaude(imageBase64: string): Promise<{ full_text: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: FULL_TEXT_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: FULL_TEXT_EXTRACTION_USER_PROMPT,
            },
          ],
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const text = responseContent.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { full_text: string };
    return parsed;
  } catch (error) {
    console.error('Claude full text extraction error:', error);
    throw error;
  }
}

/**
 * Extract full text from document using Claude from text (for "Otros" type)
 * For PDFs that already have extracted text, we can return it directly
 */
export async function extractFullTextWithClaudeFromText(text: string): Promise<{ full_text: string }> {
  // For text-based documents, return the text directly wrapped in the expected format
  return { full_text: text };
}

