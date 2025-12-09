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
import { correctPdfOrientation, correctPdfOrientationWithTest } from '@/lib/utils/pdf-orientation';
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
    let buffer = Buffer.from(arrayBuffer);
    
    // Correct PDF orientation before processing for optimal OCR accuracy
    // This ensures 100% correctness regardless of how the user uploaded the document
    // We test original orientation first, and only test rotations if extraction quality is poor
    if (isPdf) {
      try {
        // Quick test with original orientation
        let bestBuffer: Buffer = buffer;
        let bestTextLength = 0;
        let bestHasKeywords = false;
        let shouldTestRotations = false;
        
        try {
          const originalText = await extractTextFromPdf(buffer);
          const originalHasKeywords = /patente|registro|comercio|guatemala|inscripcion|numero|fecha/i.test(originalText);
          bestTextLength = originalText.trim().length;
          bestHasKeywords = originalHasKeywords;
          
          // Only test rotations if extraction is poor (low text or no keywords)
          // This optimizes for the common case where orientation is correct
          shouldTestRotations = bestTextLength < 200 || !bestHasKeywords;
          
          if (!shouldTestRotations) {
            console.log(`Original orientation is good: ${bestTextLength} chars, keywords found`);
          } else {
            console.log(`Original orientation extraction poor (${bestTextLength} chars, keywords: ${bestHasKeywords}), testing rotations...`);
          }
        } catch (originalError) {
          // If extraction fails completely, definitely test rotations
          console.log('Original orientation extraction failed, testing rotations...');
          shouldTestRotations = true;
        }
        
        // Only test rotations if needed (optimization for common case)
        if (shouldTestRotations) {
          const rotations = [90, 180, 270];
          
          for (const angle of rotations) {
            try {
              const { rotatePdfPage } = await import('@/lib/utils/pdf-orientation');
              const rotatedBuffer = await rotatePdfPage(buffer, 0, angle);
              const rotatedText = await extractTextFromPdf(rotatedBuffer);
              const rotatedHasKeywords = /patente|registro|comercio|guatemala|inscripcion|numero|fecha/i.test(rotatedText);
              const rotatedLength = rotatedText.trim().length;
              
              // Prefer orientation with keywords, or significantly more text
              const isBetter = 
                (rotatedHasKeywords && !bestHasKeywords) ||
                (rotatedHasKeywords === bestHasKeywords && rotatedLength > bestTextLength * 1.15);
              
              if (isBetter) {
                bestBuffer = Buffer.from(rotatedBuffer);
                bestTextLength = rotatedLength;
                bestHasKeywords = rotatedHasKeywords;
                console.log(`Found better orientation at ${angle}°: ${rotatedLength} chars, keywords: ${rotatedHasKeywords}`);
              }
            } catch (rotationError) {
              console.warn(`Failed to test ${angle}° rotation:`, rotationError);
              // Continue with other rotations
            }
          }
        }
        
        const originalBuffer = buffer;
        buffer = Buffer.from(bestBuffer);
        if (bestBuffer !== originalBuffer) {
          console.log(`Applied orientation correction: ${bestTextLength} chars extracted`);
        }
      } catch (orientationError) {
        console.warn('Orientation correction failed, using original PDF:', orientationError);
        // Continue with original buffer if correction fails
      }
    }
    
    // Process PDFs with AWS Textract (better accuracy for legal documents)
    // Images are converted to base64 for vision APIs
    let useTextExtraction = false;
    let extractedText = '';
    let base64 = '';
    
    if (isPdf) {
      try {
        // Use AWS Textract for PDFs - purpose-built for legal/government forms
        // Buffer has been orientation-corrected if needed
        extractedText = await extractTextFromPdf(buffer);
        useTextExtraction = true;
      } catch (textractError) {
        console.error('Textract error, falling back to image conversion:', textractError);
        // Fallback to image conversion if Textract fails
        // Buffer is already orientation-corrected
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
      let claudeSystemVersionId = '';
      let claudeUserVersionId = '';
      let openaiSystemVersionId = '';
      let openaiUserVersionId = '';

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

      const specificResult = compareResults(claudeStructured, openaiStructured);
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

