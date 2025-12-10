/**
 * Extraction functions that support versioned prompts
 */

import { extractWithClaude, extractWithClaudeFromText } from './claude';
import { extractWithGemini, extractWithGeminiFromText } from './gemini';
import { getActivePrompts } from '@/lib/ml/prompt-versioning';
import { RawExtractionFields } from '@/types';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Model ID configuration - use environment variable or default to current stable version
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || 'gemini-2.5-pro';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

/**
 * Extract with Claude using versioned prompts
 */
export async function extractWithClaudeVersioned(
  imageBase64: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  // Get active prompts
  const { system, user } = await getActivePrompts(docType, 'claude');

  // Use versioned prompts if available, otherwise fall back to defaults
  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt && system && user) {
    // Use custom prompts
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
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
              text: userPrompt,
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

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    // Fall back to default extraction
    const result = await extractWithClaude(imageBase64);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

/**
 * Extract with Claude from text using versioned prompts
 */
export async function extractWithClaudeFromTextVersioned(
  text: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  const { system, user } = await getActivePrompts(docType, 'claude');

  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt && system && user) {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${userPrompt}\n\nDocument text:\n${text}`,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const responseText = responseContent.text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    const result = await extractWithClaudeFromText(text);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

/**
 * Extract with Gemini using versioned prompts
 */
export async function extractWithGeminiVersioned(
  imageBase64: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  const { system, user } = await getActivePrompts(docType, 'gemini');

  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt && system && user) {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    // Combine system and user prompts for Gemini
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

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

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    const result = await extractWithGemini(imageBase64);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

/**
 * Extract with Gemini from text using versioned prompts
 */
export async function extractWithGeminiFromTextVersioned(
  text: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  const { system, user } = await getActivePrompts(docType, 'gemini');

  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt && system && user) {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL_ID,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nDocument text:\n${text}`;

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

    const parsed = JSON.parse(jsonMatch[0]) as RawExtractionFields;
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    const result = await extractWithGeminiFromText(text);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

