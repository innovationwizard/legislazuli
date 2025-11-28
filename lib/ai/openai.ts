import OpenAI from 'openai';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from './prompts';
import { RawExtractionFields } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

type FileData = 
  | { type: 'pdf'; buffer: Buffer; mimeType: string }
  | { type: 'image'; base64: string; mimeType: string };

export async function extractWithOpenAI(fileData: FileData): Promise<RawExtractionFields> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    // Build content array based on file type
    const content: any[] = [
      {
        type: 'text',
        text: EXTRACTION_USER_PROMPT,
      },
    ];
    
    if (fileData.type === 'pdf') {
      // OpenAI GPT-4o vision API supports PDFs via data URL
      // If this doesn't work, we may need to convert PDF to image as fallback
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:application/pdf;base64,${fileData.buffer.toString('base64')}`,
        },
      });
    } else {
      // Image files
      const base64Data = fileData.base64.split(',')[1] || fileData.base64;
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${fileData.mimeType || 'image/png'};base64,${base64Data}`,
        },
      });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 4096,
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    // Extract JSON from response
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('OpenAI extraction error:', error);
    throw error;
  }
}

