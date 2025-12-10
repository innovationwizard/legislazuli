/**
 * Golden Set Tester - Regression Testing for Prompt Evolution
 * 
 * Prevents "Catastrophic Forgetting" / Prompt Drift by testing new prompts
 * against a curated set of documents that represent the "Perfect Range" of inputs.
 * 
 * The Golden Set should contain:
 * - 5 pristine, perfect PDFs
 * - 5 rotated/scanned images (that work correctly)
 * - 5 complex edge cases (previously solved)
 * 
 * This acts as a gatekeeper: new prompts are only promoted if they maintain
 * or improve performance on the Golden Set.
 */

import { createServerClient } from '@/lib/db/supabase';
import { getPromptVersion } from '@/lib/ml/prompt-versioning';
import { convertPdfToImage } from '@/lib/utils/pdf-to-image';
import { extractTextFromPdf } from '@/lib/utils/textract';
import { normalizeDocumentOrientation } from '@/lib/utils/normalize-orientation';
import { TextractClient } from '@aws-sdk/client-textract';
import { compareResults } from '@/lib/ai/consensus';
import { RawExtractionFields } from '@/types';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || 'gemini-2.5-pro';

/**
 * Helper: Extract with Claude using specific prompt content (for testing)
 */
async function extractWithClaudeWithPrompts(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RawExtractionFields> {
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

  return JSON.parse(jsonMatch[0]) as RawExtractionFields;
}

/**
 * Helper: Extract with Claude from text using specific prompt content (for testing)
 */
async function extractWithClaudeFromTextWithPrompts(
  text: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RawExtractionFields> {
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

  return JSON.parse(jsonMatch[0]) as RawExtractionFields;
}

/**
 * Helper: Extract with Gemini using specific prompt content (for testing)
 */
async function extractWithGeminiWithPrompts(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RawExtractionFields> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

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

  return JSON.parse(jsonMatch[0]) as RawExtractionFields;
}

/**
 * Helper: Extract with Gemini from text using specific prompt content (for testing)
 */
async function extractWithGeminiFromTextWithPrompts(
  text: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RawExtractionFields> {
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

  return JSON.parse(jsonMatch[0]) as RawExtractionFields;
}

interface GoldenSetTestResult {
  accuracy: number; // 0-1
  totalFields: number;
  correctFields: number;
  failedDocuments: Array<{
    documentId: string;
    filename: string;
    errors: string[];
  }>;
}

/**
 * Test prompt versions against the Golden Set
 * 
 * This function:
 * 1. Retrieves all Golden Set documents for the doc_type
 * 2. Re-runs extraction with the new prompt versions
 * 3. Compares results against known correct values (from previous extractions)
 * 4. Returns accuracy metrics
 */
export async function testGoldenSet(
  docType: string,
  model: 'claude' | 'gemini',
  systemPromptVersionId: string,
  userPromptVersionId: string
): Promise<GoldenSetTestResult> {
  const supabase = createServerClient();

  // Get prompt versions
  const systemVersion = await getPromptVersion(systemPromptVersionId);
  const userVersion = await getPromptVersion(userPromptVersionId);

  if (!systemVersion || !userVersion) {
    throw new Error('Prompt versions not found');
  }

  // Get Golden Set documents for this doc_type
  const { data: goldenDocuments, error: docsError } = await supabase
    .from('documents')
    .select('id, filename, file_path, doc_type')
    .eq('is_golden_set', true)
    .eq('doc_type', docType)
    .limit(20); // Limit to 20 documents for performance

  if (docsError) {
    throw new Error(`Failed to fetch Golden Set documents: ${docsError.message}`);
  }

  if (!goldenDocuments || goldenDocuments.length === 0) {
    console.warn(`⚠ No Golden Set documents found for ${docType}. Golden Set testing skipped.`);
    return {
      accuracy: 1.0, // Pass if no golden set exists (first time setup)
      totalFields: 0,
      correctFields: 0,
      failedDocuments: [],
    };
  }

  // Get baseline extractions (the "correct" values from previous successful extractions)
  const documentIds = goldenDocuments.map(d => d.id);
  const { data: baselineExtractions } = await supabase
    .from('extractions')
    .select(`
      id,
      document_id,
      ${model}_result,
      consensus_result,
      documents!inner(id, file_path, doc_type)
    `)
    .in('document_id', documentIds)
    .order('created_at', { ascending: false });

  if (!baselineExtractions || baselineExtractions.length === 0) {
    console.warn(`⚠ No baseline extractions found for Golden Set documents. Skipping test.`);
    return {
      accuracy: 1.0,
      totalFields: 0,
      correctFields: 0,
      failedDocuments: [],
    };
  }

  // Initialize Textract client
  const textractClient = new TextractClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  let totalFields = 0;
  let correctFields = 0;
  const failedDocuments: Array<{ documentId: string; filename: string; errors: string[] }> = [];

  // Test each Golden Set document
  for (const doc of goldenDocuments) {
    const baselineExtraction = baselineExtractions.find(
      (e: any) => e.document_id === doc.id
    ) as any;

    if (!baselineExtraction) {
      console.warn(`⚠ No baseline extraction found for Golden Set document ${doc.filename}`);
      continue;
    }

    try {
      // Download document from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (downloadError || !fileData) {
        console.error(`Failed to download Golden Set document ${doc.filename}:`, downloadError);
        failedDocuments.push({
          documentId: doc.id,
          filename: doc.filename,
          errors: [`Download failed: ${downloadError?.message}`],
        });
        continue;
      }

      // Convert to buffer
      const arrayBuffer = await fileData.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      // Normalize orientation
      const mimeType = doc.filename.endsWith('.pdf') ? 'application/pdf' : 'image/png';
      let processedBuffer = buffer;
      let extractedText = '';
      let base64 = '';

      try {
        const orientationResult = await normalizeDocumentOrientation(
          buffer,
          textractClient,
          mimeType
        );
        processedBuffer = Buffer.from(orientationResult.buffer);
      } catch (orientationError) {
        console.warn(`Orientation normalization failed for ${doc.filename}, using original`);
      }

      // Process document
      const isPdf = mimeType === 'application/pdf';
      if (isPdf) {
        try {
          extractedText = await extractTextFromPdf(processedBuffer);
        } catch (textractError) {
          base64 = await convertPdfToImage(processedBuffer);
        }
      } else {
        base64 = processedBuffer.toString('base64');
      }

      // Get prompt content from versions
      const systemPrompt = systemVersion.prompt_content;
      const userPrompt = userVersion.prompt_content;

      // Extract with NEW prompt versions using direct prompt content
      let newResult: RawExtractionFields;

      if (extractedText) {
        // Use text extraction
        if (model === 'claude') {
          newResult = await extractWithClaudeFromTextWithPrompts(extractedText, systemPrompt, userPrompt);
        } else {
          newResult = await extractWithGeminiFromTextWithPrompts(extractedText, systemPrompt, userPrompt);
        }
      } else {
        // Use image extraction
        if (model === 'claude') {
          newResult = await extractWithClaudeWithPrompts(base64, systemPrompt, userPrompt);
        } else {
          newResult = await extractWithGeminiWithPrompts(base64, systemPrompt, userPrompt);
        }
      }

      // Compare against baseline
      const baselineResult = baselineExtraction.consensus_result || baselineExtraction[`${model}_result`];
      
      if (!baselineResult) {
        console.warn(`No baseline result found for ${doc.filename}`);
        continue;
      }

      // Use consensus comparison to find discrepancies
      const comparison = compareResults(
        newResult,
        baselineResult as RawExtractionFields
      );

      // Count correct fields
      const documentErrors: string[] = [];
      for (const result of comparison.results) {
        totalFields++;
        if (result.match && result.confidence > 0.95) {
          correctFields++;
        } else {
          documentErrors.push(`${result.field_name}: expected "${result.final_value || 'N/A'}", got "${result.claude_value || result.openai_value || 'N/A'}"`);
        }
      }

      if (documentErrors.length > 0) {
        failedDocuments.push({
          documentId: doc.id,
          filename: doc.filename,
          errors: documentErrors,
        });
      }

    } catch (error: any) {
      console.error(`Error testing Golden Set document ${doc.filename}:`, error);
      failedDocuments.push({
        documentId: doc.id,
        filename: doc.filename,
        errors: [`Extraction error: ${error.message}`],
      });
    }
  }

  const accuracy = totalFields > 0 ? correctFields / totalFields : 1.0;

  return {
    accuracy,
    totalFields,
    correctFields,
    failedDocuments,
  };
}

/**
 * Compare new prompt performance against current active prompts on Golden Set
 */
export async function comparePromptVersionsOnGoldenSet(
  docType: string,
  model: 'claude' | 'gemini',
  newSystemVersionId: string,
  newUserVersionId: string
): Promise<{
  newAccuracy: number;
  currentAccuracy: number;
  improvement: number;
  passed: boolean;
  failedDocuments: Array<{ documentId: string; filename: string; errors: string[] }>;
}> {
  // Test new prompts
  const newResult = await testGoldenSet(docType, model, newSystemVersionId, newUserVersionId);

  // Get current active prompts and test them
  const supabase = createServerClient();
  const { data: currentSystem } = await supabase
    .from('prompt_versions')
    .select('id')
    .eq('doc_type', docType)
    .eq('model', model)
    .eq('prompt_type', 'system')
    .eq('is_active', true)
    .single();

  const { data: currentUser } = await supabase
    .from('prompt_versions')
    .select('id')
    .eq('doc_type', docType)
    .eq('model', model)
    .eq('prompt_type', 'user')
    .eq('is_active', true)
    .single();

  let currentAccuracy = 1.0;
  if (currentSystem && currentUser) {
    const currentResult = await testGoldenSet(
      docType,
      model,
      currentSystem.id,
      currentUser.id
    );
    currentAccuracy = currentResult.accuracy;
  }

  const improvement = newResult.accuracy - currentAccuracy;
  const passed = newResult.accuracy >= currentAccuracy; // Must maintain or improve

  return {
    newAccuracy: newResult.accuracy,
    currentAccuracy,
    improvement,
    passed,
    failedDocuments: newResult.failedDocuments,
  };
}

