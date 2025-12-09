import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { 
  extractWithClaude, 
  extractWithClaudeFromText,
  detectDocumentTypeWithClaude,
  detectDocumentTypeWithClaudeFromText,
  extractFullTextWithClaude,
  extractFullTextWithClaudeFromText
} from '@/lib/ai/claude';
import { 
  extractWithOpenAI, 
  extractWithOpenAIFromText,
  detectDocumentTypeWithOpenAI,
  detectDocumentTypeWithOpenAIFromText,
  extractFullTextWithOpenAI,
  extractFullTextWithOpenAIFromText
} from '@/lib/ai/openai';
import {
  extractWithClaudeVersioned,
  extractWithClaudeFromTextVersioned,
  extractWithOpenAIVersioned,
  extractWithOpenAIFromTextVersioned,
} from '@/lib/ai/extract-with-prompts';
import { saveExtractionPromptVersions } from '@/lib/ml/prompt-versioning';
import { 
  compareResults, 
  convertToExtractedFields
} from '@/lib/ai/consensus';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { convertPdfToImage } from '@/lib/utils/pdf-to-image';
import { extractTextFromPdf } from '@/lib/utils/textract';
import { DocType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const docType = formData.get('doc_type') as DocType;

    if (!file || !docType) {
      return NextResponse.json({ error: 'Missing file or doc_type' }, { status: 400 });
    }

    // Validate file type
    const validImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    const isPdf = file.type === 'application/pdf';
    
    if (!isPdf && !validImageTypes.includes(file.type)) {
      return NextResponse.json(
        { 
          error: `Formato de archivo no soportado: ${file.type}. Por favor, sube un archivo PDF, PNG, JPG, GIF o WEBP.`,
          errorCode: 'UNSUPPORTED_FORMAT'
        },
        { status: 400 }
      );
    }

    // Get file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Let AWS Textract handle orientation detection automatically
    // Textract has built-in orientation detection and correction
    
    // Process PDFs with AWS Textract (better accuracy for legal documents)
    // Images are converted to base64 for vision APIs
    let useTextExtraction = false;
    let extractedText = '';
    let base64 = '';
    
    if (isPdf) {
      try {
        // Use AWS Textract for PDFs - purpose-built for legal/government forms
        // Textract handles orientation detection automatically
        extractedText = await extractTextFromPdf(buffer);
        useTextExtraction = true;
      } catch (textractError) {
        console.error('Textract error, falling back to image conversion:', textractError);
        // Fallback to image conversion if Textract fails
        // Buffer is ready for processing
        try {
          base64 = await convertPdfToImage(buffer);
        } catch (imageError) {
          console.error('PDF conversion error:', imageError);
          return NextResponse.json(
            { 
              error: 'Error al procesar el PDF. Por favor, asegúrate de que el archivo PDF no esté corrupto.',
              errorCode: 'PDF_CONVERSION_ERROR'
            },
            { status: 400 }
          );
        }
      }
    } else {
      // Image files can be used directly
      base64 = buffer.toString('base64');
    }

    // Upload to Supabase Storage
    const supabase = createServerClient();
    // Sanitize filename to remove spaces and special characters
    const sanitizedFilename = sanitizeFilename(file.name);
    const fileName = `${Date.now()}_${sanitizedFilename}`;
    const filePath = `${session.user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Detect document type if doc_type is "otros"
    let detectedDocumentType: string | null = null;
    if (docType === 'otros') {
      try {
        const [claudeDetection, openaiDetection] = await Promise.all([
          useTextExtraction
            ? detectDocumentTypeWithClaudeFromText(extractedText).catch(err => {
                console.error('Claude document type detection error:', err);
                return null;
              })
            : detectDocumentTypeWithClaude(base64).catch(err => {
                console.error('Claude document type detection error:', err);
                return null;
              }),
          useTextExtraction
            ? detectDocumentTypeWithOpenAIFromText(extractedText).catch(err => {
                console.error('OpenAI document type detection error:', err);
                return null;
              })
            : detectDocumentTypeWithOpenAI(base64).catch(err => {
                console.error('OpenAI document type detection error:', err);
                return null;
              }),
        ]);

        // Use the detection with higher confidence, or Claude's if both available
        if (claudeDetection && openaiDetection) {
          // Prefer the one with higher confidence, or Claude's if equal
          const claudeConf = claudeDetection.confidence === 'alta' ? 3 : claudeDetection.confidence === 'media' ? 2 : 1;
          const openaiConf = openaiDetection.confidence === 'alta' ? 3 : openaiDetection.confidence === 'media' ? 2 : 1;
          detectedDocumentType = claudeConf >= openaiConf ? claudeDetection.document_type : openaiDetection.document_type;
        } else if (claudeDetection) {
          detectedDocumentType = claudeDetection.document_type;
        } else if (openaiDetection) {
          detectedDocumentType = openaiDetection.document_type;
        }

        if (detectedDocumentType) {
          console.log('Detected document type:', detectedDocumentType);
        }
      } catch (error) {
        console.error('Error detecting document type:', error);
        // Continue with extraction even if detection fails
      }
    }

    // Save document record
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: session.user.id,
        filename: file.name,
        file_path: filePath,
        doc_type: docType,
        detected_document_type: detectedDocumentType,
      })
      .select()
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }

    // Extract with both APIs in parallel
    // Use full text extraction for "otros", specific extraction for other types
    // Use text extraction for PDFs (via Textract), image extraction for images
    let consensus: any;
    let confidence: 'full' | 'partial' | 'review_required';
    let discrepancies: string[];
    let extractedFields: any[];
    let claudeResult: any;
    let openaiResult: any;
    // Prompt version IDs (for structured documents only)
    let claudeSystemVersionId = '';
    let claudeUserVersionId = '';
    let openaiSystemVersionId = '';
    let openaiUserVersionId = '';

    if (docType === 'otros') {
      // For "Otros", extract full text
      const [claudeFullText, openaiFullText] = await Promise.all([
        useTextExtraction
          ? extractFullTextWithClaudeFromText(extractedText).catch(err => {
              console.error('Claude full text extraction error:', err);
              return null;
            })
          : extractFullTextWithClaude(base64).catch(err => {
              console.error('Claude full text extraction error:', err);
              return null;
            }),
        useTextExtraction
          ? extractFullTextWithOpenAIFromText(extractedText).catch(err => {
              console.error('OpenAI full text extraction error:', err);
              return null;
            })
          : extractFullTextWithOpenAI(base64).catch(err => {
              console.error('OpenAI full text extraction error:', err);
              return null;
            }),
      ]);

      if (!claudeFullText || !openaiFullText) {
        return NextResponse.json(
          { error: 'Failed to extract full text from document' },
          { status: 500 }
        );
      }

      // For full text, prefer Claude's result (more accurate for OCR), but compare both
      const claudeText = claudeFullText.full_text.trim();
      const openaiText = openaiFullText.full_text.trim();
      
      // Simple similarity check
      const similarity = claudeText === openaiText ? 1.0 : 
        (claudeText.length > 0 && openaiText.length > 0 ? 
          Math.min(claudeText.length, openaiText.length) / Math.max(claudeText.length, openaiText.length) : 0);
      
      // Use Claude's text as primary (better OCR), but mark if there are significant differences
      consensus = { full_text: claudeText };
      confidence = similarity > 0.95 ? 'full' : similarity > 0.8 ? 'partial' : 'review_required';
      discrepancies = similarity < 0.95 ? ['full_text'] : [];
      
      // Store results for database
      claudeResult = claudeFullText;
      openaiResult = openaiFullText;
      
      // Convert full text to extracted fields format
      extractedFields = [{
        field_name: 'Texto Completo',
        field_value: claudeText,
        needs_review: confidence === 'review_required',
      }];
    } else {
      // For specific document types, use structured extraction with versioned prompts
      const [claudeExtraction, openaiExtraction] = await Promise.all([
        (async () => {
          try {
            if (useTextExtraction) {
              const result = await extractWithClaudeFromTextVersioned(extractedText, docType);
              claudeSystemVersionId = result.systemVersionId;
              claudeUserVersionId = result.userVersionId;
              return result.result;
            } else {
              const result = await extractWithClaudeVersioned(base64, docType);
              claudeSystemVersionId = result.systemVersionId;
              claudeUserVersionId = result.userVersionId;
              return result.result;
            }
          } catch (err) {
            console.error('Claude extraction error:', err);
            return null;
          }
        })(),
        (async () => {
          try {
            if (useTextExtraction) {
              const result = await extractWithOpenAIFromTextVersioned(extractedText, docType);
              openaiSystemVersionId = result.systemVersionId;
              openaiUserVersionId = result.userVersionId;
              return result.result;
            } else {
              const result = await extractWithOpenAIVersioned(base64, docType);
              openaiSystemVersionId = result.systemVersionId;
              openaiUserVersionId = result.userVersionId;
              return result.result;
            }
          } catch (err) {
            console.error('OpenAI extraction error:', err);
            return null;
          }
        })(),
      ]);

      if (!claudeExtraction || !openaiExtraction) {
        return NextResponse.json(
          { error: 'Failed to extract data from document' },
          { status: 500 }
        );
      }

      claudeResult = claudeExtraction;
      openaiResult = openaiExtraction;

      const specificResult = compareResults(claudeExtraction, openaiExtraction);
      consensus = specificResult.consensus;
      confidence = specificResult.confidence;
      discrepancies = specificResult.discrepancies;
      extractedFields = convertToExtractedFields(consensus, discrepancies);
    }

    // Save extraction
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .insert({
        document_id: document.id,
        claude_result: claudeResult,
        openai_result: openaiResult,
        consensus_result: consensus,
        confidence,
        discrepancies: discrepancies.length > 0 ? discrepancies : null,
      })
      .select()
      .single();

    if (extractionError || !extraction) {
      return NextResponse.json({ error: 'Failed to save extraction' }, { status: 500 });
    }

    // Save prompt versions used (only for structured documents)
    if (docType !== 'otros' && extraction.id) {
      try {
        if (claudeSystemVersionId && claudeUserVersionId) {
          await saveExtractionPromptVersions(
            extraction.id,
            'claude',
            claudeSystemVersionId,
            claudeUserVersionId
          );
        }
        if (openaiSystemVersionId && openaiUserVersionId) {
          await saveExtractionPromptVersions(
            extraction.id,
            'openai',
            openaiSystemVersionId,
            openaiUserVersionId
          );
        }
      } catch (error) {
        console.error('Error saving prompt versions:', error);
        // Don't fail the extraction if prompt versioning fails
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

    const { error: fieldsError } = await supabase
      .from('extracted_fields')
      .insert(fieldsToInsert);

    if (fieldsError) {
      console.error('Fields insert error:', fieldsError);
    }

    return NextResponse.json({
      extraction_id: extraction.id,
      confidence,
      fields: extractedFields,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
    });
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

