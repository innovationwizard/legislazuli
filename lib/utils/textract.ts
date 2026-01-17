/**
 * Extracts text from PDFs using AWS Textract
 * Purpose-built for legal/government forms with high accuracy
 * Works perfectly in serverless environments
 */

import { 
  TextractClient, 
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  Block
} from '@aws-sdk/client-textract';

const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

/**
 * Extracts text from a PDF using AWS Textract
 * Returns the full text content of the document
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
  }

  // Validate PDF buffer
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty or invalid');
  }

  // Check PDF size limits (Textract has a 500MB limit, but we'll be more conservative)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (pdfBuffer.length > maxSize) {
    throw new Error(`PDF is too large (${Math.round(pdfBuffer.length / 1024 / 1024)}MB). Maximum size is 100MB.`);
  }

  // Validate PDF header (should start with %PDF)
  const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
  if (pdfHeader !== '%PDF') {
    throw new Error('Invalid PDF format: file does not appear to be a valid PDF');
  }

  try {
    // CRITICAL FIX: Use AnalyzeDocumentCommand for PDFs (DetectDocumentText only accepts images)
    // AnalyzeDocument supports PDFs and provides better structure analysis
    const command = new AnalyzeDocumentCommand({
      Document: {
        Bytes: pdfBuffer,
      },
      FeatureTypes: ['FORMS', 'TABLES'], // Extract forms and tables for legal documents
    });

    const response = await textractClient.send(command);

    // Extract text from blocks
    const textBlocks: string[] = [];
    
    if (response.Blocks) {
      // Sort blocks by page and geometry
      const blocks = response.Blocks
        .filter(block => block.BlockType === 'LINE' && block.Text)
        .sort((a, b) => {
          // Sort by page, then by top position
          const pageA = a.Page || 0;
          const pageB = b.Page || 0;
          if (pageA !== pageB) return pageA - pageB;
          
          const topA = a.Geometry?.BoundingBox?.Top || 0;
          const topB = b.Geometry?.BoundingBox?.Top || 0;
          return topA - topB;
        });

      for (const block of blocks) {
        if (block.Text) {
          textBlocks.push(block.Text);
        }
      }
    }

    // Join all text blocks with newlines
    const fullText = textBlocks.join('\n');
    
    if (!fullText.trim()) {
      throw new Error('No text extracted from PDF');
    }

    return fullText;
  } catch (error) {
    console.error('Textract extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extracts text from an image using AWS Textract DetectDocumentText
 * Returns the full text content of the document
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Image buffer is empty or invalid');
  }

  const maxSize = 10 * 1024 * 1024; // 10MB (Textract image limit is 10MB)
  if (imageBuffer.length > maxSize) {
    throw new Error(`Image is too large (${Math.round(imageBuffer.length / 1024 / 1024)}MB). Maximum size is 10MB.`);
  }

  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: imageBuffer,
      },
    });

    const response = await textractClient.send(command);

    const textBlocks: string[] = [];
    if (response.Blocks) {
      const blocks = response.Blocks
        .filter((block: Block) => block.BlockType === 'LINE' && block.Text)
        .sort((a, b) => {
          const topA = a.Geometry?.BoundingBox?.Top || 0;
          const topB = b.Geometry?.BoundingBox?.Top || 0;
          if (topA !== topB) return topA - topB;
          const leftA = a.Geometry?.BoundingBox?.Left || 0;
          const leftB = b.Geometry?.BoundingBox?.Left || 0;
          return leftA - leftB;
        });

      for (const block of blocks) {
        if (block.Text) {
          textBlocks.push(block.Text);
        }
      }
    }

    const fullText = textBlocks.join('\n');
    if (!fullText.trim()) {
      throw new Error('No text extracted from image');
    }

    return fullText;
  } catch (error) {
    console.error('Textract image extraction error:', error);
    throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extracts text from a document (PDF or image) using AWS Textract
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    return extractTextFromPdf(buffer);
  }

  return extractTextFromImage(buffer);
}

