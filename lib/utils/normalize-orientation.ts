/**
 * Normalizes document orientation (PDF and images) based on AWS Textract's detection
 * 
 * AWS Textract detects rotation but doesn't physically modify the file.
 * This utility physically rotates documents based on Textract's detection
 * so that LLMs (Claude/GPT-4o) receive correctly oriented documents.
 */

import { 
  TextractClient, 
  DetectDocumentTextCommand,
  DetectDocumentTextCommandOutput,
  AnalyzeDocumentCommand,
  AnalyzeDocumentCommandOutput,
  Block 
} from '@aws-sdk/client-textract';
import { PDFDocument, degrees } from 'pdf-lib';
import sharp from 'sharp';

// Textract orientation values and their correction angles
// Textract returns how the document IS rotated, so we rotate the OPPOSITE direction
type TextractOrientation = 'ROTATE_0' | 'ROTATE_90' | 'ROTATE_180' | 'ROTATE_270';

const ROTATION_CORRECTION: Record<TextractOrientation, number> = {
  'ROTATE_0': 0,
  'ROTATE_90': -90,
  'ROTATE_180': -180,
  'ROTATE_270': -270,
};

interface OrientationResult {
  buffer: Buffer;
  wasRotated: boolean;
  detectedOrientation?: string;
  appliedCorrection?: number;
  textractResponse?: DetectDocumentTextCommandOutput | AnalyzeDocumentCommandOutput;
}

/**
 * Validates if a PDF is supported by Textract
 * Checks for common issues like encryption, password protection, etc.
 */
function validatePdfFormat(pdfBuffer: Buffer): { isValid: boolean; reason?: string } {
  try {
    // Check PDF header
    const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
    if (!pdfHeader.startsWith('%PDF-')) {
      return { isValid: false, reason: 'Invalid PDF header' };
    }

    // Check for encryption markers
    const pdfContent = pdfBuffer.toString('latin1');

    // Check for encryption dictionary
    if (pdfContent.includes('/Encrypt')) {
      return { isValid: false, reason: 'PDF is encrypted or password-protected' };
    }

    // Check for XFA forms (not supported by Textract)
    if (pdfContent.includes('/XFA')) {
      return { isValid: false, reason: 'PDF contains XFA forms (not supported)' };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, reason: 'Failed to validate PDF format' };
  }
}

/**
 * Detects document orientation using Textract's DetectDocumentText API
 * This API has built-in orientation detection that's more reliable than AnalyzeDocument
 *
 * Returns both the orientation and the full Textract response for verification
 */
async function detectOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient,
  mimeType: string
): Promise<{ orientation: TextractOrientation; response: DetectDocumentTextCommandOutput | AnalyzeDocumentCommandOutput }> {
  // Validate buffer before sending to Textract
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('File buffer is empty or invalid');
  }

  // Check file size limits
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (fileBuffer.length > maxSize) {
    throw new Error(`File is too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). Maximum size is 100MB.`);
  }

  // Validate PDF format before sending to Textract
  if (mimeType === 'application/pdf') {
    const validation = validatePdfFormat(fileBuffer);
    if (!validation.isValid) {
      console.warn(`PDF validation failed: ${validation.reason}`);
      throw new Error(`UnsupportedDocumentFormat: ${validation.reason}`);
    }
  }

  // Use appropriate API based on file type
  // For PDFs, use AnalyzeDocument (supports multi-page PDFs)
  // For images, use DetectDocumentText (faster and cheaper)
  const isPdf = mimeType === 'application/pdf';
  
  let response: DetectDocumentTextCommandOutput | AnalyzeDocumentCommandOutput;
  
  if (isPdf) {
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: fileBuffer },
      FeatureTypes: ['FORMS'], // Minimal features for orientation detection
    });
    response = await textractClient.send(command);
  } else {
    const command = new DetectDocumentTextCommand({
      Document: { Bytes: fileBuffer },
    });
    response = await textractClient.send(command);
  }

  // Find PAGE blocks - they contain orientation metadata
  const pageBlocks = response.Blocks?.filter(
    (block: Block) => block.BlockType === 'PAGE'
  ) || [];

  if (pageBlocks.length === 0) {
    console.log('Textract: No PAGE blocks found, assuming ROTATE_0');
    return { orientation: 'ROTATE_0' as TextractOrientation, response };
  }

  // Get orientation from first page block
  // Textract stores this in custom fields depending on API version
  const pageBlock = pageBlocks[0] as Block & { 
    // Textract may return orientation in different fields
    Orientation?: TextractOrientation;
  };

  // Check multiple possible locations for orientation data
  // 1. Direct Orientation field (some API versions)
  if (pageBlock.Orientation) {
    return { orientation: pageBlock.Orientation, response };
  }

  // 2. Check geometry for rotation hints
  // If document is rotated, the bounding box polygon will be rotated
  const geometry = pageBlock.Geometry;
  if (geometry?.Polygon && geometry.Polygon.length >= 4) {
    const polygon = geometry.Polygon;
    
    // Calculate the angle of the top edge
    // For a correctly oriented document, top-left to top-right should be roughly horizontal
    const topLeft = polygon[0];
    const topRight = polygon[1];
    
    if (topLeft && topRight && topLeft.X !== undefined && topLeft.Y !== undefined &&
        topRight.X !== undefined && topRight.Y !== undefined) {
      const dx = topRight.X - topLeft.X;
      const dy = topRight.Y - topLeft.Y;
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = angleRad * (180 / Math.PI);
      
      // Classify angle into 90-degree buckets
      // Normal: ~0°, Rotated 90° CW: ~90°, Upside down: ~180°/-180°, Rotated 270° CW: ~-90°
      let orientation: TextractOrientation;
      if (angleDeg > -45 && angleDeg <= 45) {
        orientation = 'ROTATE_0';
      } else if (angleDeg > 45 && angleDeg <= 135) {
        orientation = 'ROTATE_90';
      } else if (angleDeg > 135 || angleDeg <= -135) {
        orientation = 'ROTATE_180';
      } else {
        orientation = 'ROTATE_270';
      }
      return { orientation, response };
    }
  }

  // 3. Analyze text line orientations as fallback
  const lineBlocks = response.Blocks?.filter(
    (block: Block) => block.BlockType === 'LINE'
  ) || [];

  if (lineBlocks.length > 0) {
    // Sample first few lines to determine dominant orientation
    const sampleLines = lineBlocks.slice(0, Math.min(10, lineBlocks.length));
    const orientations: TextractOrientation[] = [];

    for (const line of sampleLines) {
      const poly = line.Geometry?.Polygon;
      if (poly && poly.length >= 2) {
        const p0 = poly[0];
        const p1 = poly[1];
        if (p0 && p1 && p0.X !== undefined && p0.Y !== undefined &&
            p1.X !== undefined && p1.Y !== undefined) {
          const dx = p1.X - p0.X;
          const dy = p1.Y - p0.Y;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);

          if (angle > -45 && angle <= 45) {
            orientations.push('ROTATE_0');
          } else if (angle > 45 && angle <= 135) {
            orientations.push('ROTATE_90');
          } else if (angle > 135 || angle <= -135) {
            orientations.push('ROTATE_180');
          } else {
            orientations.push('ROTATE_270');
          }
        }
      }
    }

    // Return most common orientation
    if (orientations.length > 0) {
      const counts = orientations.reduce((acc, o) => {
        acc[o] = (acc[o] || 0) + 1;
        return acc;
      }, {} as Record<TextractOrientation, number>);

      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (dominant) {
        return { orientation: dominant[0] as TextractOrientation, response };
      }
    }
  }

  return { orientation: 'ROTATE_0' as TextractOrientation, response };
}

/**
 * Normalizes document orientation based on Textract's detection
 */
export async function normalizeDocumentOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient,
  mimeType: string
): Promise<OrientationResult> {
  const isPdf = mimeType === 'application/pdf';

  try {
    // Detect orientation and get full Textract response
    const { orientation: detectedOrientation, response: textractResponse } = await detectOrientation(fileBuffer, textractClient, mimeType);

    console.log(`Textract detected orientation: ${detectedOrientation}`);

    if (detectedOrientation === 'ROTATE_0') {
      return { 
        buffer: fileBuffer, 
        wasRotated: false,
        detectedOrientation,
        textractResponse,
      };
    }

    const rotationCorrection = ROTATION_CORRECTION[detectedOrientation];

    // Apply physical rotation
    let result: OrientationResult;
    if (isPdf) {
      result = await rotatePdf(fileBuffer, rotationCorrection, detectedOrientation);
    } else {
      result = await rotateImage(fileBuffer, rotationCorrection, detectedOrientation, mimeType);
    }
    
    // Include Textract response for verification
    result.textractResponse = textractResponse;
    return result;
  } catch (error) {
    // Check if it's an UnsupportedDocumentException
    if (error && typeof error === 'object' && '__type' in error && error.__type === 'UnsupportedDocumentException') {
      console.warn('Textract: Document format not supported, skipping orientation normalization:', error);
      // Return original buffer without rotation
      return { buffer: fileBuffer, wasRotated: false };
    }
    console.error('Orientation normalization error:', error);
    // Return original buffer on any error
    return { buffer: fileBuffer, wasRotated: false };
  }
}

/**
 * Rotates a PDF document
 */
async function rotatePdf(
  fileBuffer: Buffer,
  rotationCorrection: number,
  detectedOrientation: string
): Promise<OrientationResult> {
  const pdfDoc = await PDFDocument.load(fileBuffer);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + rotationCorrection));
  }

  const rotatedPdfBytes = await pdfDoc.save();

  console.log(`✓ PDF corrected: ${rotationCorrection}° (was ${detectedOrientation})`);

  return {
    buffer: Buffer.from(rotatedPdfBytes),
    wasRotated: true,
    detectedOrientation,
    appliedCorrection: rotationCorrection,
  };
}

/**
 * Rotates an image using sharp
 */
async function rotateImage(
  fileBuffer: Buffer,
  rotationCorrection: number,
  detectedOrientation: string,
  mimeType: string
): Promise<OrientationResult> {
  // Convert negative to positive for sharp (e.g., -90 → 270)
  const sharpRotation = rotationCorrection < 0 ? 360 + rotationCorrection : rotationCorrection;

  let pipeline = sharp(fileBuffer, { failOn: 'none' })
    .rotate(sharpRotation, {
      background: mimeType === 'image/png' || mimeType === 'image/gif'
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 255, g: 255, b: 255 },
    });

  // Output format with max quality
  switch (mimeType) {
    case 'image/png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    case 'image/jpeg':
    case 'image/jpg':
      pipeline = pipeline.jpeg({ quality: 100, mozjpeg: true });
      break;
    case 'image/webp':
      pipeline = pipeline.webp({ quality: 100, lossless: true });
      break;
    default:
      pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const rotatedBuffer = await pipeline.toBuffer();

  console.log(`✓ Image corrected: ${sharpRotation}° (was ${detectedOrientation})`);

  return {
    buffer: rotatedBuffer,
    wasRotated: true,
    detectedOrientation,
    appliedCorrection: rotationCorrection,
  };
}

/**
 * @deprecated Use normalizeDocumentOrientation instead
 */
export async function normalizePdfOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient
): Promise<OrientationResult> {
  return normalizeDocumentOrientation(fileBuffer, textractClient, 'application/pdf');
}
