/**
 * Extracts text from PDFs using AWS Textract
 * Purpose-built for legal/government forms with high accuracy
 * Works perfectly in serverless environments
 */

import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';

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

  try {
    // Textract accepts PDF bytes directly
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: pdfBuffer,
      },
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

