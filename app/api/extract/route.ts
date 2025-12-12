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
import { uploadPdfToS3, generateS3Key } from '@/lib/aws/s3';
import { startDocumentAnalysis } from '@/lib/aws/textract-async';
import { DocType } from '@/types';

// Threshold for async processing (PDFs larger than this use async)
const ASYNC_PROCESSING_THRESHOLD = 1 * 1024 * 1024; // 1MB

// Vercel Serverless Timeout Configuration
// Extraction performs heavy operations: Textract, dual LLM inference, consensus, verification
// Set to maximum allowed duration to prevent 504 Gateway Timeout errors
// NOTE: Hobby plan limit is 10 seconds. For better performance, consider upgrading to Pro (60s timeout)
export const maxDuration = 10; // 10 seconds (Vercel Hobby plan max, Pro allows up to 60s)
export const dynamic = 'force-dynamic'; // Prevent static caching

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
    } catch (normalizationError: any) {
      console.warn('Orientation normalization failed, using original document:', normalizationError);

      // Check if it's an unsupported format error from our validation
      const errorMessage = normalizationError?.message || '';
      if (errorMessage.includes('UnsupportedDocumentFormat')) {
        // Extract the reason from the error message
        const reason = errorMessage.replace('UnsupportedDocumentFormat: ', '');
        return NextResponse.json(
          {
            error: `PDF no soportado: ${reason}. Por favor, intenta con un PDF diferente o convierte el documento a un formato compatible.`,
            errorCode: 'UNSUPPORTED_PDF_FORMAT',
            details: reason
          },
          { status: 400 }
        );
      }

      // Check if it's an UnsupportedDocumentException from Textract
      // For orientation normalization, we can continue without rotation
      // The PDF might still be processable even if orientation detection fails
      if (normalizationError?.__type === 'UnsupportedDocumentException' ||
          errorMessage.includes('unsupported document format')) {
        console.warn('Textract orientation detection failed - PDF format may be unsupported, but continuing anyway');
        // Continue with original buffer - don't fail the entire request
        processedBuffer = buffer;
      } else {
        // Continue with original buffer for other errors
        processedBuffer = buffer;
      }
    }
    
    // Process PDFs with AWS Textract (better accuracy for legal documents)
    // Images are converted to base64 for vision APIs
    let useTextExtraction = false;
    let extractedText = '';
    let base64 = '';
    
    if (isPdf) {
      // Enterprise Architecture: Use async processing for large PDFs
      // This decouples heavy processing from HTTP response loop
      const useAsyncProcessing = processedBuffer.length > ASYNC_PROCESSING_THRESHOLD && 
                                 process.env.AWS_S3_BUCKET_NAME;

      if (useAsyncProcessing) {
        // Upload to S3 and start async Textract job
        const s3Key = generateS3Key(session.user.id, 'temp', file.name);
        
        try {
          const s3Result = await uploadPdfToS3(processedBuffer, s3Key);
          const jobId = await startDocumentAnalysis(s3Result.bucket, s3Result.key);

          // Upload to Supabase Storage as well (for backup/access)
          const supabase = createServerClient();
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
            console.error('Supabase upload error:', uploadError);
            // Continue anyway - S3 upload succeeded
          }

          // Save document first
          const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
              user_id: session.user.id,
              filename: file.name,
              file_path: filePath, // Supabase storage path
              doc_type: docType,
              detected_document_type: null,
            })
            .select()
            .single();

          if (docError || !document) {
            return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
          }

          // Create Textract job record
          const { data: textractJob, error: textractJobError } = await supabase
            .from('textract_jobs')
            .insert({
              document_id: document.id,
              job_id: jobId,
              s3_bucket: s3Result.bucket,
              s3_key: s3Result.key,
              status: 'IN_PROGRESS',
            })
            .select()
            .single();

          if (textractJobError || !textractJob) {
            return NextResponse.json({ error: 'Failed to create Textract job' }, { status: 500 });
          }

          // Create extraction job record
          const { data: extractionJob, error: extractionJobError } = await supabase
            .from('extraction_jobs')
            .insert({
              document_id: document.id,
              textract_job_id: textractJob.id,
              status: 'PROCESSING_TEXTTRACT',
              status_message: 'Textract analysis in progress...',
            })
            .select()
            .single();

          if (extractionJobError || !extractionJob) {
            return NextResponse.json({ error: 'Failed to create extraction job' }, { status: 500 });
          }

          // Return job ID for polling
          return NextResponse.json({
            jobId: extractionJob.id,
            status: 'PROCESSING_TEXTTRACT',
            message: 'PDF is being processed asynchronously. Use /api/jobs/[id]/status to check progress.',
            estimatedTime: '2-5 minutes',
          }, { status: 202 }); // 202 Accepted - processing started
        } catch (asyncError: any) {
          console.error('Async processing setup error:', asyncError);
          
          // If S3 bucket doesn't exist, provide helpful error
          if (asyncError?.message?.includes('does not exist') || 
              asyncError?.Code === 'NoSuchBucket' ||
              asyncError?.name === 'NoSuchBucket') {
            return NextResponse.json(
              {
                error: `Configuración de S3 requerida: El bucket "${process.env.AWS_S3_BUCKET_NAME || 'no configurado'}" no existe. Por favor, crea el bucket en AWS S3 o configura AWS_S3_BUCKET_NAME correctamente.`,
                errorCode: 'S3_BUCKET_NOT_FOUND',
                details: asyncError.message
              },
              { status: 500 }
            );
          }
          
          // Fall through to sync processing if async setup fails for other reasons
          console.warn('Falling back to synchronous processing due to async setup failure');
        }
      }

      // Synchronous processing (for small PDFs or if async setup failed)
      try {
        // Use AWS Textract for PDFs - purpose-built for legal/government forms
        // Note: processedBuffer is now correctly oriented
        // For PDFs, we already have the Textract response from orientation normalization
        // But we need to extract text separately
        // WARNING: With 10s timeout (Hobby plan), large/complex PDFs may timeout
        // Consider upgrading to Pro plan (60s) for better reliability
        extractedText = await extractTextFromPdf(processedBuffer);
        useTextExtraction = true;
        
        // For PDFs, textractResponseForVerification should already be set from orientation normalization
        // If not (shouldn't happen), we'll handle verification gracefully
      } catch (textractError: any) {
        console.error('Textract error, falling back to image conversion:', textractError);
        
        // Check if it's an UnsupportedDocumentException
        const isUnsupportedFormat = textractError?.__type === 'UnsupportedDocumentException' || 
                                    textractError?.message?.includes('unsupported document format');
        
        if (isUnsupportedFormat) {
          console.warn('Textract: Unsupported document format, attempting image conversion fallback');
          
          // For unsupported formats, try image conversion
          // But first check if this is a large PDF that should use async
          if (processedBuffer.length > ASYNC_PROCESSING_THRESHOLD) {
            return NextResponse.json(
              {
                error: 'El formato del PDF no es compatible con Textract. PDFs grandes (>1MB) requieren un formato estándar sin encriptación. Por favor, intenta: 1) Guardar el PDF como un nuevo archivo sin protección, 2) Convertir a imágenes (PNG/JPG), o 3) Usar un PDF más pequeño.',
                errorCode: 'UNSUPPORTED_PDF_FORMAT_LARGE',
                details: 'Textract UnsupportedDocumentException - PDF may be encrypted or in unsupported format'
              },
              { status: 400 }
            );
          }
        }
        
        // Fallback to image conversion if Textract fails
        // Use processedBuffer (correctly oriented) for image conversion
        try {
          base64 = await convertPdfToImage(processedBuffer);
        } catch (imageError: any) {
          console.error('PDF conversion error:', imageError);
          
          // Check if it's a Chromium path error
          const isChromiumError = imageError?.message?.includes('chromium') || 
                                 imageError?.message?.includes('brotli') ||
                                 imageError?.message?.includes('executablePath') ||
                                 imageError?.message?.includes('ERR_ABORTED');
          
          if (isChromiumError) {
            return NextResponse.json(
              { 
                error: 'Error al procesar el PDF: el formato no es compatible con el sistema de conversión. Por favor, intenta convertir el PDF a imágenes (PNG/JPG) manualmente o usa un PDF en formato estándar.',
                errorCode: 'PDF_CONVERSION_CONFIG_ERROR',
                details: 'Chromium/PDF conversion error - PDF format may be unsupported'
              },
              { status: 400 }
            );
          }
          
          // Provide helpful error message
          const errorDetails = isUnsupportedFormat 
            ? 'Document format not supported by Textract. PDF may be encrypted, password-protected, or in an unsupported format.'
            : imageError?.message || 'Unknown error';
          
          return NextResponse.json(
            { 
              error: 'Error al procesar el PDF. El formato puede no ser compatible. Por favor, intenta: 1) Guardar el PDF como un nuevo archivo sin protección, 2) Convertir a imágenes (PNG/JPG), o 3) Verificar que el PDF no esté corrupto.',
              errorCode: 'PDF_CONVERSION_ERROR',
              details: errorDetails
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
        const missing = [];
        if (!claudeExtraction) missing.push('Claude');
        if (!geminiExtraction) missing.push('Gemini');
        
        console.error(`Extraction failed: ${missing.join(' and ')} returned null`);
        return NextResponse.json(
          { 
            error: `Failed to extract data from document: ${missing.join(' and ')} extraction failed`,
            errorCode: 'EXTRACTION_FAILED',
            details: `Missing extractions: ${missing.join(', ')}`
          },
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
          // NUMERIC fields use strict verification (no Levenshtein on numbers)
          // TEXT fields use fuzzy matching (Levenshtein distance)
          const criticalFields: Array<{ 
            fieldName: string; 
            value: string; 
            type: 'TEXT' | 'NUMERIC';
            expectedLocation?: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM' 
          }> = [
            { 
              fieldName: 'numero_patente', 
              value: consensus.numero_patente || '', 
              type: 'NUMERIC', // Strict verification - single digit difference is critical error
              expectedLocation: 'TOP_RIGHT' // Patent numbers are typically in top-right
            },
            { 
              fieldName: 'numero_registro', 
              value: consensus.numero_registro || '',
              type: 'NUMERIC' // Strict verification - registration numbers must be exact
            },
            { 
              fieldName: 'fecha_inscripcion', 
              value: consensus.fecha_inscripcion?.numeric || '',
              type: 'TEXT' // Dates can have format variations, use fuzzy matching
            },
            { 
              fieldName: 'numero_expediente', 
              value: consensus.numero_expediente || '',
              type: 'NUMERIC' // Strict verification - expediente numbers must be exact
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
                  field.expectedLocation,
                  field.type
                );
              } else {
                return verifier.verifyField(field.fieldName, field.value, field.type);
              }
            });
          
          // Flag fields that Textract couldn't verify or are suspicious
          const unverifiedFields = verificationResults
            .filter(r => r.status === 'NOT_FOUND' || r.status === 'SUSPICIOUS')
            .map(r => r.field);
          
          const suspiciousFields = verificationResults
            .filter(r => r.status === 'SUSPICIOUS')
            .map(r => r.field);
          
          // If critical fields are not verified or suspicious, escalate confidence level
          if (unverifiedFields.length > 0) {
            if (suspiciousFields.length > 0) {
              console.warn(`⚠ Textract verification SUSPICIOUS for numeric fields: ${suspiciousFields.join(', ')} - digit differences detected`);
            }
            if (unverifiedFields.length > suspiciousFields.length) {
              console.warn(`⚠ Textract verification failed for fields: ${unverifiedFields.filter(f => !suspiciousFields.includes(f)).join(', ')}`);
            }
            
            // If critical numeric field like numero_patente is suspicious or not found, require review
            // SUSPICIOUS means a digit difference was detected (e.g., 76869 vs 76868) - critical error
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
                  // Mark for review if NOT_FOUND, SUSPICIOUS, or FUZZY_MATCH with low confidence
                  needs_review: field.needs_review || 
                    verification.status === 'NOT_FOUND' || 
                    verification.status === 'SUSPICIOUS' ||
                    (verification.status === 'FUZZY_MATCH' && verification.confidence < 0.9),
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
    console.error('Extraction API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: errorMessage,
      stack: errorStack,
      error: error
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        errorCode: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

