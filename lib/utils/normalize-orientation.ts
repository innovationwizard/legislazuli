/**
 * Normalizes document orientation (PDF and images) based on AWS Textract's detection
 * 
 * AWS Textract detects rotation but doesn't physically modify the file.
 * This utility physically rotates documents based on Textract's detection
 * so that LLMs (Claude/GPT-4o) receive correctly oriented documents.
 */

import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { PDFDocument, degrees } from 'pdf-lib';
import sharp from 'sharp';

// Map Textract's detected orientation to degrees required to FIX it
// Textract returns how the page IS rotated, so we must rotate the OPPOSITE way
const ROTATION_MAP: Record<string, number> = {
  'ROTATE_0': 0,
  'ROTATE_90': -90,   // Or 270
  'ROTATE_180': -180, // Or 180
  'ROTATE_270': -270, // Or 90
};

/**
 * Normalizes document orientation (PDF or image) based on Textract's detection
 * @param fileBuffer - The original file buffer (PDF or image)
 * @param textractClient - Textract client instance
 * @param mimeType - MIME type of the file (e.g., 'application/pdf', 'image/png')
 * @returns Normalized buffer and rotation status
 */
export async function normalizeDocumentOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient,
  mimeType: string
): Promise<{ buffer: Buffer; wasRotated: boolean }> {
  const isPdf = mimeType === 'application/pdf';
  
  try {
    // 1. Ask Textract for the orientation (Lightweight check)
    // We use "FORMS" just to trigger analysis, but we only care about Metadata
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: fileBuffer },
      FeatureTypes: ['FORMS'],
    });

    const response = await textractClient.send(command);

    // Guard clause: If Textract fails or finds nothing, return original
    const metadataPages = response.DocumentMetadata?.Pages;
    if (!metadataPages || !Array.isArray(metadataPages) || metadataPages.length === 0) {
      console.log('Textract: No orientation metadata found, using original orientation');
      return { buffer: fileBuffer, wasRotated: false };
    }

    // 2. Get the detected orientation
    // Note: AWS returns the orientation of the INPUT.
    // e.g., "ROTATE_90" means "This page is currently rotated 90 degrees clockwise."
    const pageMetadata = metadataPages[0];
    const detectedOrientation = 
      (pageMetadata as any).DetectedDocumentOrientation || 
      (pageMetadata as any).OrientationCorrection || 
      'ROTATE_0';

    if (detectedOrientation === 'ROTATE_0') {
      console.log('Textract: Document is already correctly oriented');
      return { buffer: fileBuffer, wasRotated: false };
    }

    console.log(`Textract detected orientation: ${detectedOrientation}`);

    const rotationAdjustment = ROTATION_MAP[detectedOrientation] || 0;

    if (rotationAdjustment === 0) {
      console.log('Textract: No rotation adjustment needed');
      return { buffer: fileBuffer, wasRotated: false };
    }

    // 3. Apply the physical rotation
    if (isPdf) {
      return await rotatePdf(fileBuffer, rotationAdjustment, detectedOrientation);
    } else {
      return await rotateImage(fileBuffer, rotationAdjustment, detectedOrientation, mimeType);
    }
  } catch (error) {
    console.error('Orientation normalization error:', error);
    // If normalization fails, return original buffer to avoid breaking the pipeline
    console.warn('Returning original document due to orientation normalization error');
    return { buffer: fileBuffer, wasRotated: false };
  }
}

/**
 * Rotates a PDF document
 */
async function rotatePdf(
  fileBuffer: Buffer,
  rotationAdjustment: number,
  detectedOrientation: string
): Promise<{ buffer: Buffer; wasRotated: boolean }> {
  const pdfDoc = await PDFDocument.load(fileBuffer);
  const pages = pdfDoc.getPages();

  pages.forEach((page) => {
    // We add the adjustment to the existing rotation
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + rotationAdjustment));
  });

  // Save and return the corrected buffer
  const rotatedPdfBytes = await pdfDoc.save();

  console.log(`✓ Applied PDF orientation correction: ${rotationAdjustment}° (from ${detectedOrientation})`);

  return {
    buffer: Buffer.from(rotatedPdfBytes),
    wasRotated: true,
  };
}

/**
 * Rotates an image using sharp
 */
async function rotateImage(
  fileBuffer: Buffer,
  rotationAdjustment: number,
  detectedOrientation: string,
  mimeType: string
): Promise<{ buffer: Buffer; wasRotated: boolean }> {
  // Convert negative rotation to positive (sharp uses positive angles)
  // -90 -> 270, -180 -> 180, -270 -> 90
  let sharpRotation = rotationAdjustment;
  if (sharpRotation < 0) {
    sharpRotation = 360 + sharpRotation;
  }

  // Determine output format based on input
  let sharpInstance = sharp(fileBuffer);
  
  // Apply rotation (sharp can handle any angle)
  sharpInstance = sharpInstance.rotate(sharpRotation);

  // Convert to appropriate format
  if (mimeType === 'image/png') {
    sharpInstance = sharpInstance.png();
  } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    sharpInstance = sharpInstance.jpeg();
  } else if (mimeType === 'image/webp') {
    sharpInstance = sharpInstance.webp();
  } else if (mimeType === 'image/gif') {
    // GIF rotation - convert to PNG for better compatibility
    sharpInstance = sharpInstance.png();
  } else {
    // Default to PNG
    sharpInstance = sharpInstance.png();
  }

  const rotatedImageBuffer = await sharpInstance.toBuffer();

  console.log(`✓ Applied image orientation correction: ${sharpRotation}° (from ${detectedOrientation})`);

  return {
    buffer: rotatedImageBuffer,
    wasRotated: true,
  };
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use normalizeDocumentOrientation instead
 */
/**
 * Legacy function name for backward compatibility
 * @deprecated Use normalizeDocumentOrientation instead
 */
export async function normalizePdfOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient
): Promise<{ buffer: Buffer; wasRotated: boolean }> {
  return normalizeDocumentOrientation(fileBuffer, textractClient, 'application/pdf');
}

