import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  EXTRACTION_SYSTEM_PROMPT, 
  EXTRACTION_USER_PROMPT,
  EXTRACTION_SYSTEM_PROMPT_OPENAI,
  EXTRACTION_USER_PROMPT_OPENAI,
  DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT,
  DOCUMENT_TYPE_DETECTION_USER_PROMPT,
  FULL_TEXT_EXTRACTION_SYSTEM_PROMPT,
  FULL_TEXT_EXTRACTION_USER_PROMPT
} from './prompts';
import { RawExtractionFields } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

/**
 * Extract structured data from an image using Gemini 1.5 Pro vision API
 */
export async function extractWithGemini(imageBase64: string): Promise<RawExtractionFields> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  try {
    // Use gemini-1.5-pro for maximum reasoning/OCR accuracy
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1, // Lower temperature for more deterministic, accurate results
        maxOutputTokens: 4096,
      },
    });

    // Combine system and user prompts for Gemini (it doesn't have separate system messages)
    const fullPrompt = `${EXTRACTION_SYSTEM_PROMPT_OPENAI}\n\n${EXTRACTION_USER_PROMPT_OPENAI}`;

    // Prepare image part
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([fullPrompt, imagePart]);
    const response = await result.response;

    const text = response.text();
    if (!text) {
      throw new Error('No content in Gemini response');
    }

    // Clean potential markdown code blocks
    const jsonStr = text.replace(/```json|```/g, '').trim();
    
    // Extract JSON from response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('Gemini extraction error:', error);
    throw error;
  }
}

/**
 * Extract structured data from text using Gemini
 * Used when PDF text is extracted via AWS Textract
 */
export async function extractWithGeminiFromText(text: string): Promise<RawExtractionFields> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    // Combine system and user prompts
    const fullPrompt = `${EXTRACTION_SYSTEM_PROMPT_OPENAI}\n\n${EXTRACTION_USER_PROMPT_OPENAI}\n\nDocument text:\n${text}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;

    const textResponse = response.text();
    if (!textResponse) {
      throw new Error('No content in Gemini response');
    }

    // Clean potential markdown code blocks
    const jsonStr = textResponse.replace(/```json|```/g, '').trim();
    
    // Extract JSON from response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return parsed;
  } catch (error) {
    console.error('Gemini text extraction error:', error);
    throw error;
  }
}

/**
 * Detect document type from an image using Gemini
 */
export async function detectDocumentTypeWithGemini(imageBase64: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const fullPrompt = `${DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT}\n\n${DOCUMENT_TYPE_DETECTION_USER_PROMPT}`;

    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([fullPrompt, imagePart]);
    const response = await result.response;

    const text = response.text();
    if (!text) {
      throw new Error('No content in Gemini response');
    }

    const jsonStr = text.replace(/```json|```/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('Gemini document type detection error:', error);
    throw error;
  }
}

/**
 * Detect document type from text using Gemini
 */
export async function detectDocumentTypeWithGeminiFromText(text: string): Promise<{ document_type: string; confidence: string; description?: string }> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const fullPrompt = `${DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT}\n\n${DOCUMENT_TYPE_DETECTION_USER_PROMPT}\n\nDocument text:\n${text}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;

    const textResponse = response.text();
    if (!textResponse) {
      throw new Error('No content in Gemini response');
    }

    const jsonStr = textResponse.replace(/```json|```/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { document_type: string; confidence: string; description?: string };
    return parsed;
  } catch (error) {
    console.error('Gemini document type detection error:', error);
    throw error;
  }
}

/**
 * Extract full text from document using Gemini (for "Otros" type)
 */
export async function extractFullTextWithGemini(imageBase64: string): Promise<{ full_text: string }> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    });

    const fullPrompt = `${FULL_TEXT_EXTRACTION_SYSTEM_PROMPT}\n\n${FULL_TEXT_EXTRACTION_USER_PROMPT}`;

    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([fullPrompt, imagePart]);
    const response = await result.response;

    const text = response.text();
    if (!text) {
      throw new Error('No content in Gemini response');
    }

    const jsonStr = text.replace(/```json|```/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { full_text: string };
    return parsed;
  } catch (error) {
    console.error('Gemini full text extraction error:', error);
    throw error;
  }
}

/**
 * Extract full text from document using Gemini from text (for "Otros" type)
 * For PDFs that already have extracted text, we can return it directly
 */
export async function extractFullTextWithGeminiFromText(text: string): Promise<{ full_text: string }> {
  // For text-based documents, return the text directly wrapped in the expected format
  return { full_text: text };
}

