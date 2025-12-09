/**
 * Normalizes PDF orientation based on AWS Textract's detection
 * 
 * AWS Textract detects rotation but doesn't physically modify the file.
 * This utility physically rotates the PDF based on Textract's detection
 * so that LLMs (Claude/GPT-4o) receive correctly oriented documents.
 */

import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { PDFDocument, degrees } from 'pdf-lib';

// Map Textract's detected orientation to degrees required to FIX it
// Textract returns how the page IS rotated, so we must rotate the OPPOSITE way
const ROTATION_MAP: Record<string, number> = {
  'ROTATE_0': 0,
  'ROTATE_90': -90,   // Or 270
  'ROTATE_180': -180, // Or 180
  'ROTATE_270': -270, // Or 90
};

export async function normalizePdfOrientation(
  fileBuffer: Buffer,
  textractClient: TextractClient
): Promise<{ buffer: Buffer; wasRotated: boolean }> {
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

    // 3. Apply the physical rotation using pdf-lib
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    const rotationAdjustment = ROTATION_MAP[detectedOrientation] || 0;

    if (rotationAdjustment === 0) {
      console.log('Textract: No rotation adjustment needed');
      return { buffer: fileBuffer, wasRotated: false };
    }

    pages.forEach((page) => {
      // We add the adjustment to the existing rotation
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + rotationAdjustment));
    });

    // 4. Save and return the corrected buffer
    const rotatedPdfBytes = await pdfDoc.save();

    console.log(`✓ Applied orientation correction: ${rotationAdjustment}° (from ${detectedOrientation})`);

    return {
      buffer: Buffer.from(rotatedPdfBytes),
      wasRotated: true,
    };
  } catch (error) {
    console.error('Orientation normalization error:', error);
    // If normalization fails, return original buffer to avoid breaking the pipeline
    console.warn('Returning original PDF due to orientation normalization error');
    return { buffer: fileBuffer, wasRotated: false };
  }
}

