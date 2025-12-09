/**
 * Extraction functions that support versioned prompts
 */

import { extractWithClaude, extractWithClaudeFromText } from './claude';
import { extractWithOpenAI, extractWithOpenAIFromText } from './openai';
import { getActivePrompts } from '@/lib/ml/prompt-versioning';
import { RawExtractionFields } from '@/types';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

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

  if (systemPrompt && userPrompt) {
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

  if (systemPrompt && userPrompt) {
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
 * Extract with OpenAI using versioned prompts
 */
export async function extractWithOpenAIVersioned(
  imageBase64: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  const { system, user } = await getActivePrompts(docType, 'openai');

  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
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
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    const result = await extractWithOpenAI(imageBase64);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

/**
 * Extract with OpenAI from text using versioned prompts
 */
export async function extractWithOpenAIFromTextVersioned(
  text: string,
  docType: string
): Promise<{ result: RawExtractionFields; systemVersionId: string; userVersionId: string }> {
  const { system, user } = await getActivePrompts(docType, 'openai');

  const systemPrompt = system?.prompt_content || undefined;
  const userPrompt = user?.prompt_content || undefined;

  if (systemPrompt && userPrompt) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${userPrompt}\n\nDocument text:\n${text}`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
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
    return {
      result: parsed,
      systemVersionId: system.id,
      userVersionId: user.id,
    };
  } else {
    const result = await extractWithOpenAIFromText(text);
    return {
      result,
      systemVersionId: '',
      userVersionId: '',
    };
  }
}

