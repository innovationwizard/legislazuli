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
  extractWithGemini, 
  extractWithGeminiFromText,
  detectDocumentTypeWithGemini,
  detectDocumentTypeWithGeminiFromText,
  extractFullTextWithGemini,
  extractFullTextWithGeminiFromText
} from '@/lib/ai/gemini';
import {
  extractWithClaudeVersioned,
  extractWithClaudeFromTextVersioned,
  extractWithGeminiVersioned,
  extractWithGeminiFromTextVersioned,
} from '@/lib/ai/extract-with-prompts';
import { saveExtractionPromptVersions } from '@/lib/ml/prompt-versioning';
import { 
  compareResults, 
  convertToExtractedFields
} from '@/lib/ai/consensus';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { convertPdfToImage } from '@/lib/utils/pdf-to-image';
import { extractTextFromPdf } from '@/lib/utils/textract';
import { normalizeDocumentOrientation } from '@/lib/utils/normalize-orientation';
import { TextractClient } from '@aws-sdk/client-textract';
import { TextractVerifier } from '@/lib/verification/textract-verifier';
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
    
    // Normalize document orientation before processing (for both PDFs and images)
    // Textract detects rotation but doesn't physically modify the file
    // We need to physically rotate documents so LLMs receive correctly oriented documents
    let processedBuffer = buffer;
    try {
      // Create Textract client for orientation detection
      const textractClient = new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
      });

      // Normalize orientation based on Textract's detection (works for PDFs and images)
      // This also returns the full Textract response for verification
      const orientationResult = await normalizeDocumentOrientation(
        buffer,
        textractClient,
        file.type
      );
      processedBuffer = Buffer.from(orientationResult.buffer);
      
      // Store Textract response for verification (will be used after LLM extraction)
      // For PDFs, we can reuse this response; for images, we'll get it from text extraction
      var textractResponseForVerification = orientationResult.textractResponse;
      
      if (orientationResult.wasRotated) {
        console.log(`✓ ${isPdf ? 'PDF' : 'Image'} orientation normalized before LLM processing (${orientationResult.detectedOrientation}, correction: ${orientationResult.appliedCorrection}°)`);
      }
    } catch (normalizationError) {
      console.warn('Orientation normalization failed, using original document:', normalizationError);
      // Continue with original buffer if normalization fails
      processedBuffer = buffer;
    }
    
    // Process PDFs with AWS Textract (better accuracy for legal documents)
    // Images are converted to base64 for vision APIs
    let useTextExtraction = false;
    let extractedText = '';
    let base64 = '';
    
    if (isPdf) {
      try {
        // Use AWS Textract for PDFs - purpose-built for legal/government forms
        // Note: processedBuffer is now correctly oriented
        // For PDFs, we already have the Textract response from orientation normalization
        // But we need to extract text separately
        extractedText = await extractTextFromPdf(processedBuffer);
        useTextExtraction = true;
        
        // For PDFs, textractResponseForVerification should already be set from orientation normalization
        // If not (shouldn't happen), we'll handle verification gracefully
      } catch (textractError) {
        console.error('Textract error, falling back to image conversion:', textractError);
        // Fallback to image conversion if Textract fails
        // Use processedBuffer (correctly oriented) for image conversion
        try {
          base64 = await convertPdfToImage(processedBuffer);
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
      base64 = processedBuffer.toString('base64');
    }

    // Upload to Supabase Storage
    const supabase = createServerClient();
    // Sanitize filename to remove spaces and special characters
    const sanitizedFilename = sanitizeFilename(file.name);
    const fileName = `${Date.now()}_${sanitizedFilename}`;
    const filePath = `${session.user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, processedBuffer, {
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
        const [claudeDetection, geminiDetection] = await Promise.all([
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
            ? detectDocumentTypeWithGeminiFromText(extractedText).catch(err => {
                console.error('Gemini document type detection error:', err);
                return null;
              })
            : detectDocumentTypeWithGemini(base64).catch(err => {
                console.error('Gemini document type detection error:', err);
                return null;
              }),
        ]);

        // Use the detection with higher confidence, or Claude's if both available
        if (claudeDetection && geminiDetection) {
          // Prefer the one with higher confidence, or Claude's if equal
          const claudeConf = claudeDetection.confidence === 'alta' ? 3 : claudeDetection.confidence === 'media' ? 2 : 1;
          const geminiConf = geminiDetection.confidence === 'alta' ? 3 : geminiDetection.confidence === 'media' ? 2 : 1;
          detectedDocumentType = claudeConf >= geminiConf ? claudeDetection.document_type : geminiDetection.document_type;
        } else if (claudeDetection) {
          detectedDocumentType = claudeDetection.document_type;
        } else if (geminiDetection) {
          detectedDocumentType = geminiDetection.document_type;
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
    let geminiResult: any;
    // Prompt version IDs (for structured documents only)
    let claudeSystemVersionId = '';
    let claudeUserVersionId = '';
    let geminiSystemVersionId = '';
    let geminiUserVersionId = '';

    if (docType === 'otros') {
      // For "Otros", extract full text
      const [claudeFullText, geminiFullText] = await Promise.all([
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
          ? extractFullTextWithGeminiFromText(extractedText).catch(err => {
              console.error('Gemini full text extraction error:', err);
              return null;
            })
          : extractFullTextWithGemini(base64).catch(err => {
              console.error('Gemini full text extraction error:', err);
              return null;
            }),
      ]);

      if (!claudeFullText || !geminiFullText) {
        return NextResponse.json(
          { error: 'Failed to extract full text from document' },
          { status: 500 }
        );
      }

      // For full text, prefer Claude's result (more accurate for OCR), but compare both
      const claudeText = claudeFullText.full_text.trim();
      const geminiText = geminiFullText.full_text.trim();
      
      // Simple similarity check
      const similarity = claudeText === geminiText ? 1.0 : 
        (claudeText.length > 0 && geminiText.length > 0 ? 
          Math.min(claudeText.length, geminiText.length) / Math.max(claudeText.length, geminiText.length) : 0);
      
      // Use Claude's text as primary (better OCR), but mark if there are significant differences
      consensus = { full_text: claudeText };
      confidence = similarity > 0.95 ? 'full' : similarity > 0.8 ? 'partial' : 'review_required';
      discrepancies = similarity < 0.95 ? ['full_text'] : [];
      
      // Store results for database
      claudeResult = claudeFullText;
      geminiResult = geminiFullText;
      
      // Convert full text to extracted fields format
      extractedFields = [{
        field_name: 'Texto Completo',
        field_value: claudeText,
        needs_review: confidence === 'review_required',
      }];
    } else {
      // For specific document types, use structured extraction with versioned prompts
      const [claudeExtraction, geminiExtraction] = await Promise.all([
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
              const result = await extractWithGeminiFromTextVersioned(extractedText, docType);
              geminiSystemVersionId = result.systemVersionId;
              geminiUserVersionId = result.userVersionId;
              return result.result;
            } else {
              const result = await extractWithGeminiVersioned(base64, docType);
              geminiSystemVersionId = result.systemVersionId;
              geminiUserVersionId = result.userVersionId;
              return result.result;
            }
          } catch (err) {
            console.error('Gemini extraction error:', err);
            return null;
          }
        })(),
      ]);

      if (!claudeExtraction || !geminiExtraction) {
        return NextResponse.json(
          { error: 'Failed to extract data from document' },
          { status: 500 }
        );
      }

      claudeResult = claudeExtraction;
      geminiResult = geminiExtraction;

      const specificResult = compareResults(claudeExtraction, geminiExtraction);
      consensus = specificResult.consensus;
      confidence = specificResult.confidence;
      discrepancies = specificResult.discrepancies;
      extractedFields = convertToExtractedFields(consensus, discrepancies);
      
      // Run Textract verification (The Deterministic Third Voter)
      // We're already in the structured document branch (not 'otros'), so verification applies
      if (textractResponseForVerification) {
        try {
          const verifier = new TextractVerifier(textractResponseForVerification);
          
          // Define critical fields that should be verified
          // These are fields where spatial location and exact text matching matter
          const criticalFields: Array<{ fieldName: string; value: string; expectedLocation?: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM' }> = [
            { 
              fieldName: 'numero_patente', 
              value: consensus.numero_patente || '', 
              expectedLocation: 'TOP_RIGHT' // Patent numbers are typically in top-right
            },
            { 
              fieldName: 'numero_registro', 
              value: consensus.numero_registro || '' 
            },
            { 
              fieldName: 'fecha_inscripcion', 
              value: consensus.fecha_inscripcion?.numeric || '' 
            },
          ];
          
          // Verify each critical field
          const verificationResults = criticalFields
            .filter(f => f.value && f.value !== '[VACÍO]' && f.value !== '[NO APLICA]' && f.value !== '[ILEGIBLE]')
            .map(field => {
              if (field.expectedLocation) {
                return verifier.verifyFieldWithLocation(
                  field.fieldName,
                  field.value,
                  field.expectedLocation
                );
              } else {
                return verifier.verifyField(field.fieldName, field.value);
              }
            });
          
          // Flag fields that Textract couldn't verify
          const unverifiedFields = verificationResults
            .filter(r => r.status === 'NOT_FOUND')
            .map(r => r.field);
          
          // If critical fields are not verified, escalate confidence level
          if (unverifiedFields.length > 0) {
            console.warn(`⚠ Textract verification failed for fields: ${unverifiedFields.join(', ')}`);
            
            // If critical field like numero_patente is not found, require review
            if (unverifiedFields.includes('numero_patente')) {
              confidence = 'review_required';
              if (!discrepancies.includes('numero_patente')) {
                discrepancies.push('numero_patente');
              }
            }
            
            // Add verification metadata to extracted fields
            extractedFields = extractedFields.map(field => {
              const verification = verificationResults.find(v => v.field === field.field_name);
              if (verification) {
                return {
                  ...field,
                  needs_review: field.needs_review || verification.status === 'NOT_FOUND',
                  verification_status: verification.status,
                  verification_confidence: verification.confidence,
                };
              }
              return field;
            });
          } else {
            console.log('✓ Textract verification passed for all critical fields');
          }
        } catch (verificationError) {
          console.warn('Textract verification error (non-critical):', verificationError);
          // Continue even if verification fails - it's a safety check, not a blocker
        }
      }
    }

    // Save extraction
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .insert({
        document_id: document.id,
        claude_result: claudeResult,
        gemini_result: geminiResult,
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
        if (geminiSystemVersionId && geminiUserVersionId) {
          await saveExtractionPromptVersions(
            extraction.id,
            'gemini',
            geminiSystemVersionId,
            geminiUserVersionId
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

