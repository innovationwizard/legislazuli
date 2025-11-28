import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from './prompts';
import { RawExtractionFields } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

type FileData = 
  | { type: 'pdf'; buffer: Buffer; mimeType: string }
  | { type: 'image'; base64: string; mimeType: string };

export async function extractWithClaude(fileData: FileData): Promise<RawExtractionFields> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  try {
    // Build content array based on file type
    const content: any[] = [];
    
    if (fileData.type === 'pdf') {
      // Claude supports PDFs directly via file API or base64
      // Using base64 approach for consistency
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileData.buffer.toString('base64'),
        },
      });
    } else {
      // Image files
      const base64Data = fileData.base64.split(',')[1] || fileData.base64;
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: fileData.mimeType || 'image/png',
          data: base64Data,
        },
      });
    }
    
    content.push({
      type: 'text',
      text: EXTRACTION_USER_PROMPT,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content,
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

