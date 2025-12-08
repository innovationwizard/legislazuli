import OpenAI from 'openai';
import { 
  EXTRACTION_SYSTEM_PROMPT, 
  EXTRACTION_USER_PROMPT,
  DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
  DOCUMENT_TYPE_DETECTION_USER_PROMPT,
  GENERIC_EXTRACTION_SYSTEM_PROMPT,
  GENERIC_EXTRACTION_USER_PROMPT
} from './prompts';
import { RawExtractionFields } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export async function extractWithOpenAI(imageBase64: string): Promise<RawExtractionFields> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: EXTRACTION_USER_PROMPT,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
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

/**
 * Extract structured data from text using OpenAI
 * Used when PDF text is extracted via AWS Textract
 */
export async function extractWithOpenAIFromText(text: string): Promise<RawExtractionFields> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `${EXTRACTION_USER_PROMPT}\n\nDocument text:\n${text}`,
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
    console.error('OpenAI text extraction error:', error);
    throw error;
  }
}

/**
 * Detect document type from an image using OpenAI
 */
export async function detectDocumentTypeWithOpenAI(imageBase64: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: DOCUMENT_TYPE_DETECTION_USER_PROMPT,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('OpenAI document type detection error:', error);
    throw error;
  }
}

/**
 * Detect document type from text using OpenAI
 */
export async function detectDocumentTypeWithOpenAIFromText(text: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `${DOCUMENT_TYPE_DETECTION_USER_PROMPT}\n\nDocument text:\n${text}`,
        },
      ],
      max_tokens: 1024,
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('OpenAI document type detection error:', error);
    throw error;
  }
}

/**
 * Extract data from generic document using OpenAI (for "Otros" type)
 */
export async function extractGenericWithOpenAI(imageBase64: string): Promise<RawExtractionFields> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: GENERIC_EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: GENERIC_EXTRACTION_USER_PROMPT,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('OpenAI generic extraction error:', error);
    throw error;
  }
}

/**
 * Extract data from generic document using OpenAI from text (for "Otros" type)
 */
export async function extractGenericWithOpenAIFromText(text: string): Promise<RawExtractionFields> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: GENERIC_EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `${GENERIC_EXTRACTION_USER_PROMPT}\n\nDocument text:\n${text}`,
        },
      ],
      max_tokens: 4096,
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('OpenAI generic text extraction error:', error);
    throw error;
  }
}

