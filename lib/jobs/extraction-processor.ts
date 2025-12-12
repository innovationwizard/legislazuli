/**
 * Background job processor for extraction pipeline
 * Processes Textract results through LLM extraction
 */

import { createServerClient } from '@/lib/db/supabase';
import {
  extractWithClaudeFromTextVersioned,
  extractWithGeminiFromTextVersioned,
} from '@/lib/ai/extract-with-prompts';
import { compareResults, convertToExtractedFields } from '@/lib/ai/consensus';
import { TextractVerifier } from '@/lib/verification/textract-verifier';
import { saveExtractionPromptVersions } from '@/lib/ml/prompt-versioning';
import { AnalyzeDocumentCommandOutput } from '@aws-sdk/client-textract';

/**
 * Processes an extraction job after Textract completes
 * Runs LLM extraction and saves results
 */
export async function processExtractionJob(
  extractionJobId: string,
  extractedText: string,
  textractBlocks: any[]
): Promise<void> {
  const supabase = createServerClient();

  try {
    // Update job status
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'PROCESSING_LLM',
        status_message: 'Running LLM extraction...',
        updated_at: new Date().toISOString(),
      })
      .eq('id', extractionJobId);

    // Get job details
    const { data: extractionJob, error } = await supabase
      .from('extraction_jobs')
      .select(`
        *,
        document:documents(*)
      `)
      .eq('id', extractionJobId)
      .single();

    if (error || !extractionJob) {
      throw new Error('Extraction job not found');
    }

    const docType = extractionJob.document?.doc_type;
    if (!docType || docType === 'otros') {
      throw new Error('Invalid document type for structured extraction');
    }

    // Run LLM extraction in parallel
    const [claudeResult, geminiResult] = await Promise.all([
      (async () => {
        try {
          const result = await extractWithClaudeFromTextVersioned(extractedText, docType);
          return {
            extraction: result.result,
            systemVersionId: result.systemVersionId,
            userVersionId: result.userVersionId,
          };
        } catch (err) {
          console.error('Claude extraction error:', err);
          return null;
        }
      })(),
      (async () => {
        try {
          const result = await extractWithGeminiFromTextVersioned(extractedText, docType);
          return {
            extraction: result.result,
            systemVersionId: result.systemVersionId,
            userVersionId: result.userVersionId,
          };
        } catch (err) {
          console.error('Gemini extraction error:', err);
          return null;
        }
      })(),
    ]);

    if (!claudeResult || !geminiResult) {
      const missing = [];
      if (!claudeResult) missing.push('Claude');
      if (!geminiResult) missing.push('Gemini');

      throw new Error(`Extraction failed: ${missing.join(' and ')} returned null`);
    }

    // Compare results and get consensus
    const consensusResult = compareResults(claudeResult.extraction, geminiResult.extraction);
    const extractedFields = convertToExtractedFields(consensusResult.consensus, consensusResult.discrepancies);

    // Run Textract verification if available
    if (textractBlocks && textractBlocks.length > 0) {
      try {
        // Create a proper Textract response object for verification
        const textractResponse: AnalyzeDocumentCommandOutput = {
          Blocks: textractBlocks,
          $metadata: {
            httpStatusCode: 200,
            requestId: '',
          },
        };
        const verifier = new TextractVerifier(textractResponse);
        
        const criticalFields = [
          { fieldName: 'numero_patente', value: consensusResult.consensus.numero_patente || '', type: 'NUMERIC' as const },
          { fieldName: 'numero_registro', value: consensusResult.consensus.numero_registro || '', type: 'NUMERIC' as const },
        ];

        const verificationResults = criticalFields
          .filter((f) => f.value && f.value !== '[VACÍO]')
          .map((field) => verifier.verifyField(field.fieldName, field.value, field.type));

        const unverifiedFields = verificationResults
          .filter((r) => r.status === 'NOT_FOUND' || r.status === 'SUSPICIOUS')
          .map((r) => r.field);

        if (unverifiedFields.length > 0) {
          consensusResult.confidence = 'review_required';
          if (!consensusResult.discrepancies.includes('numero_patente') && unverifiedFields.includes('numero_patente')) {
            consensusResult.discrepancies.push('numero_patente');
          }
        }

        // Update fields with verification status
        extractedFields.forEach((field) => {
          const verification = verificationResults.find((v) => v.field === field.field_name);
          if (verification) {
            field.needs_review = field.needs_review || 
              verification.status === 'NOT_FOUND' || 
              verification.status === 'SUSPICIOUS';
          }
        });
      } catch (verificationError) {
        console.warn('Textract verification error (non-critical):', verificationError);
      }
    }

    // Save extraction
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .insert({
        document_id: extractionJob.document_id,
        claude_result: claudeResult.extraction,
        gemini_result: geminiResult.extraction,
        consensus_result: consensusResult.consensus,
        confidence: consensusResult.confidence,
        discrepancies: consensusResult.discrepancies.length > 0 ? consensusResult.discrepancies : null,
      })
      .select()
      .single();

    if (extractionError || !extraction) {
      throw new Error('Failed to save extraction');
    }

    // Save prompt versions
    if (extraction.id) {
      try {
        if (claudeResult.systemVersionId && claudeResult.userVersionId) {
          await saveExtractionPromptVersions(
            extraction.id,
            'claude',
            claudeResult.systemVersionId,
            claudeResult.userVersionId
          );
        }
        if (geminiResult.systemVersionId && geminiResult.userVersionId) {
          await saveExtractionPromptVersions(
            extraction.id,
            'gemini',
            geminiResult.systemVersionId,
            geminiResult.userVersionId
          );
        }
      } catch (error) {
        console.error('Error saving prompt versions:', error);
      }
    }

    // Save extracted fields
    const fieldsToInsert = extractedFields.map((field, index) => ({
      extraction_id: extraction.id,
      field_name: field.field_name,
      field_value: field.field_value,
      field_value_words: field.field_value_words || null,
      field_order: index,
      needs_review: field.needs_review,
    }));

    await supabase.from('extracted_fields').insert(fieldsToInsert);

    // Update job status to completed
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'COMPLETED',
        status_message: 'Extraction completed successfully',
        extraction_id: extraction.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', extractionJobId);

    console.log(`✓ Extraction job ${extractionJobId} completed successfully`);
  } catch (error) {
    console.error(`Error processing extraction job ${extractionJobId}:`, error);

    // Update job status to failed
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'FAILED',
        status_message: error instanceof Error ? error.message : 'Unknown error',
        error_details: { error: error instanceof Error ? error.message : 'Unknown error' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', extractionJobId);

    throw error;
  }
}

