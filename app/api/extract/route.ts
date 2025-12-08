import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { 
  extractWithClaude, 
  extractWithClaudeFromText,
  detectDocumentTypeWithClaude,
  detectDocumentTypeWithClaudeFromText,
  extractGenericWithClaude,
  extractGenericWithClaudeFromText
} from '@/lib/ai/claude';
import { 
  extractWithOpenAI, 
  extractWithOpenAIFromText,
  detectDocumentTypeWithOpenAI,
  detectDocumentTypeWithOpenAIFromText,
  extractGenericWithOpenAI,
  extractGenericWithOpenAIFromText
} from '@/lib/ai/openai';
import { 
  compareResults, 
  convertToExtractedFields,
  compareGenericResults,
  convertGenericToExtractedFields
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
    
    // Process PDFs with AWS Textract (better accuracy for legal documents)
    // Images are converted to base64 for vision APIs
    let useTextExtraction = false;
    let extractedText = '';
    let base64 = '';
    
    if (isPdf) {
      try {
        // Use AWS Textract for PDFs - purpose-built for legal/government forms
        extractedText = await extractTextFromPdf(buffer);
        useTextExtraction = true;
      } catch (textractError) {
        console.error('Textract error, falling back to image conversion:', textractError);
        // Fallback to image conversion if Textract fails
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
    // Use generic extraction for "otros", specific extraction for other types
    // Use text extraction for PDFs (via Textract), image extraction for images
    const [claudeResult, openaiResult] = await Promise.all([
      useTextExtraction
        ? (docType === 'otros'
            ? extractGenericWithClaudeFromText(extractedText).catch(err => {
                console.error('Claude generic text extraction error:', err);
                return null;
              })
            : extractWithClaudeFromText(extractedText).catch(err => {
                console.error('Claude text extraction error:', err);
                return null;
              }))
        : (docType === 'otros'
            ? extractGenericWithClaude(base64).catch(err => {
                console.error('Claude generic image extraction error:', err);
                return null;
              })
            : extractWithClaude(base64).catch(err => {
                console.error('Claude image extraction error:', err);
                return null;
              })),
      useTextExtraction
        ? (docType === 'otros'
            ? extractGenericWithOpenAIFromText(extractedText).catch(err => {
                console.error('OpenAI generic text extraction error:', err);
                return null;
              })
            : extractWithOpenAIFromText(extractedText).catch(err => {
                console.error('OpenAI text extraction error:', err);
                return null;
              }))
        : (docType === 'otros'
            ? extractGenericWithOpenAI(base64).catch(err => {
                console.error('OpenAI generic image extraction error:', err);
                return null;
              })
            : extractWithOpenAI(base64).catch(err => {
                console.error('OpenAI image extraction error:', err);
                return null;
              })),
    ]);

    if (!claudeResult || !openaiResult) {
      return NextResponse.json(
        { error: 'Failed to extract data from document' },
        { status: 500 }
      );
    }

    // Compare and create consensus
    // Use generic consensus for "otros", specific consensus for other types
    let consensus: any;
    let confidence: 'full' | 'partial' | 'review_required';
    let discrepancies: string[];
    let extractedFields: any[];

    if (docType === 'otros') {
      const genericResult = compareGenericResults(claudeResult, openaiResult);
      consensus = genericResult.consensus;
      confidence = genericResult.confidence;
      discrepancies = genericResult.discrepancies;
      extractedFields = convertGenericToExtractedFields(consensus, discrepancies);
    } else {
      const specificResult = compareResults(claudeResult, openaiResult);
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

