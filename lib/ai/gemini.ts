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

// Fail fast if key is missing at module load time
if (!process.env.GOOGLE_API_KEY) {
  console.warn('WARNING: GOOGLE_API_KEY is not set. Gemini extraction will fail.');
}

// Initialize Gemini client - fail gracefully if key is missing
let genAI: GoogleGenerativeAI | null = null;

// Model ID configuration - use environment variable or default to current stable version
// Best practice: Never hardcode model strings. Use GEMINI_MODEL_ID in .env.local
// This allows upgrading models without redeploying when deprecation hits
//
// Default: gemini-2.5-pro (primary) with gemini-2.5-flash as fallback
// Pro quota is now active - using Pro as default for best accuracy
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || 'gemini-2.5-pro';
const GEMINI_FALLBACK_MODEL_ID = process.env.GEMINI_FALLBACK_MODEL_ID || 'gemini-2.5-flash';

if (process.env.GOOGLE_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  } catch (error) {
    console.error('Failed to initialize GoogleGenerativeAI:', error);
  }
} else {
  console.warn('WARNING: GOOGLE_API_KEY is not set. Gemini extraction will fail.');
}

/**
 * Extract structured data from an image using Gemini 1.5 Pro vision API
 * @param imageBase64 - Base64 encoded image
 * @param promptOverrides - Optional object with systemPrompt and userPrompt to override defaults
 */
export async function extractWithGemini(
  imageBase64: string,
  promptOverrides?: { systemPrompt?: string; userPrompt?: string }
): Promise<RawExtractionFields> {
  if (!process.env.GOOGLE_API_KEY || !genAI) {
    const error = new Error('GOOGLE_API_KEY is not set');
    console.error('Gemini extraction error:', error);
    throw error;
  }

  try {
    // Use Gemini 2.5 Pro as primary (best accuracy for legal document extraction)
    // Note: gemini-1.5-pro-002 was retired September 2025
    // Fallback to Flash if Pro quota/billing issues occur
    // Model ID can be overridden via GEMINI_MODEL_ID environment variable
    let model;
    try {
      model = genAI.getGenerativeModel({ 
        model: GEMINI_MODEL_ID,
        generationConfig: {
          temperature: 0.1, // Lower temperature for more deterministic, accurate results
          maxOutputTokens: 4096,
        },
      });
      console.log(`✓ Using Gemini model: ${GEMINI_MODEL_ID}`);
    } catch (error) {
      // Fallback to Flash if Pro is not available (quota/billing issues)
      console.warn(`⚠ ${GEMINI_MODEL_ID} not available (quota/billing), falling back to ${GEMINI_FALLBACK_MODEL_ID}`);
      model = genAI.getGenerativeModel({ 
        model: GEMINI_FALLBACK_MODEL_ID,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      });
    }

    // Combine system and user prompts for Gemini (it doesn't have separate system messages)
    // Use overrides if provided, otherwise use defaults
    const systemPrompt = promptOverrides?.systemPrompt || EXTRACTION_SYSTEM_PROMPT_OPENAI;
    const userPrompt = promptOverrides?.userPrompt || EXTRACTION_USER_PROMPT_OPENAI;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Prepare image part - handle both data URL format and raw base64
    let base64Data = imageBase64;
    if (imageBase64.includes(',')) {
      // Remove data URL prefix if present (e.g., "data:image/png;base64,...")
      base64Data = imageBase64.split(',')[1];
    }

    if (!base64Data || base64Data.length === 0) {
      throw new Error('Invalid base64 image data');
    }

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png',
      },
    };

    let result;
    let response;
    try {
      result = await model.generateContent([fullPrompt, imagePart]);
      response = await result.response;
    } catch (apiError: any) {
      // Handle 429 quota errors - retry with fallback model
      if (apiError?.message?.includes('429') || apiError?.message?.includes('quota')) {
        console.warn(`⚠ ${GEMINI_MODEL_ID} quota exceeded, retrying with fallback ${GEMINI_FALLBACK_MODEL_ID}`);
        const fallbackModel = genAI.getGenerativeModel({ 
          model: GEMINI_FALLBACK_MODEL_ID,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        });
        result = await fallbackModel.generateContent([fullPrompt, imagePart]);
        response = await result.response;
      } else {
        throw apiError;
      }
    }

    const text = response.text();
    if (!text) {
      throw new Error('No content in Gemini response');
    }

    // Clean potential markdown code blocks
    const jsonStr = text.replace(/```json|```/g, '').trim();
    
    // Extract JSON from response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Gemini response text (no JSON found):', text.substring(0, 500));
      throw new Error('No JSON found in Gemini response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
      return parsed;
    } catch (parseError) {
      console.error('JSON parse error. Raw text:', jsonMatch[0].substring(0, 500));
      throw new Error(`Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
  } catch (error) {
    // Log the full error details for debugging
    console.error('Gemini extraction error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error: error,
      apiKeySet: !!process.env.GOOGLE_API_KEY,
      apiKeyLength: process.env.GOOGLE_API_KEY?.length || 0,
    });
    
    // Re-throw with more context, preserving original error message
    if (error instanceof Error) {
      // Check for common API errors
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('401')) {
        throw new Error(`Gemini API key is invalid. Please check your GOOGLE_API_KEY in .env.local`);
      }
      if (error.message.includes('429') || error.message.includes('quota')) {
        throw new Error(`Gemini API quota exceeded. Please check your Google Cloud Console.`);
      }
      if (error.message.includes('403')) {
        throw new Error(`Gemini API access forbidden. Please check API key permissions.`);
      }
      throw new Error(`Gemini extraction failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extract structured data from text using Gemini
 * Used when PDF text is extracted via AWS Textract
 */
export async function extractWithGeminiFromText(
  text: string,
  promptOverrides?: { systemPrompt?: string; userPrompt?: string }
): Promise<RawExtractionFields> {
  if (!process.env.GOOGLE_API_KEY || !genAI) {
    const error = new Error('GOOGLE_API_KEY is not set');
    console.error('Gemini text extraction error:', error);
    throw error;
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    // Combine system and user prompts
    // Use overrides if provided, otherwise use defaults
    const systemPrompt = promptOverrides?.systemPrompt || EXTRACTION_SYSTEM_PROMPT_OPENAI;
    const userPrompt = promptOverrides?.userPrompt || EXTRACTION_USER_PROMPT_OPENAI;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nDocument text:\n${text}`;

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
  if (!process.env.GOOGLE_API_KEY || !genAI) {
    const error = new Error('GOOGLE_API_KEY is not set');
    console.error('Gemini document type detection error:', error);
    throw error;
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
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
  if (!process.env.GOOGLE_API_KEY || !genAI) {
    const error = new Error('GOOGLE_API_KEY is not set');
    console.error('Gemini document type detection error:', error);
    throw error;
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
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
  if (!process.env.GOOGLE_API_KEY || !genAI) {
    const error = new Error('GOOGLE_API_KEY is not set');
    console.error('Gemini full text extraction error:', error);
    throw error;
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
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

