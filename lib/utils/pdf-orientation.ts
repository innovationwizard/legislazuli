/**
 * Detects and corrects PDF orientation
 * Uses content-based detection to determine if a PDF needs rotation
 * For Textract: AWS Textract handles orientation automatically, but we can pre-rotate if needed
 * For image-based: We try different orientations and pick the best result
 */

import { PDFDocument, degrees } from 'pdf-lib';

/**
 * Rotates a PDF page by the specified angle
 * @param pdfBuffer - The original PDF buffer
 * @param pageIndex - Zero-based page index (0 for first page)
 * @param angle - Rotation angle in degrees (90, 180, 270)
 * @returns A new PDF buffer with the page rotated
 */
export async function rotatePdfPage(pdfBuffer: Buffer, pageIndex: number, angle: number): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    if (pageIndex >= pages.length) {
      throw new Error(`Page index ${pageIndex} is out of range`);
    }
    
    const page = pages[pageIndex];
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + angle));
    
    const rotatedPdfBytes = await pdfDoc.save();
    return Buffer.from(rotatedPdfBytes) as Buffer;
  } catch (error) {
    console.error('PDF rotation error:', error);
    throw error;
  }
}

/**
 * Corrects PDF orientation by trying different rotations and selecting the best one
 * Uses a content-based approach: tries extraction with different orientations
 * and selects the one with the best results
 * 
 * This is used for image-based extraction where orientation matters significantly
 * 
 * @param pdfBuffer - The original PDF buffer
 * @param testExtraction - Function that tests extraction quality for a given PDF buffer
 * @returns A PDF buffer with corrected orientation
 */
export async function correctPdfOrientationWithTest(
  pdfBuffer: Buffer,
  testExtraction: (buffer: Buffer) => Promise<{ quality: number; textLength: number }>
): Promise<Buffer> {
  try {
    // Try original orientation first
    const originalResult = await testExtraction(pdfBuffer);
    let bestBuffer = pdfBuffer;
    let bestQuality = originalResult.quality;
    let bestTextLength = originalResult.textLength;

    // Try rotations: 90, 180, 270 degrees
    const rotations = [90, 180, 270];
    
    for (const angle of rotations) {
      try {
        const rotatedBuffer = await rotatePdfPage(pdfBuffer, 0, angle);
        const result = await testExtraction(rotatedBuffer);
        
        // If this rotation gives better results, use it
        // Quality is primary metric, text length is tiebreaker
        if (result.quality > bestQuality || 
            (result.quality === bestQuality && result.textLength > bestTextLength)) {
          bestBuffer = rotatedBuffer;
          bestQuality = result.quality;
          bestTextLength = result.textLength;
        }
      } catch (error) {
        console.warn(`Failed to test rotation ${angle}°:`, error);
        // Continue with other rotations
      }
    }

    // If we found a better orientation, log it
    if (bestBuffer !== pdfBuffer) {
      console.log(`PDF orientation corrected. Best quality: ${bestQuality.toFixed(2)}, text length: ${bestTextLength}`);
    }

    return bestBuffer;
  } catch (error) {
    console.error('PDF orientation correction error:', error);
    // If correction fails, return original buffer
    console.warn('Returning original PDF due to orientation correction error');
    return pdfBuffer;
  }
}

/**
 * Corrects PDF orientation based on page dimensions
 * This is a simple heuristic: if the first page is landscape (width > height),
 * rotate it to portrait. This works for most legal documents.
 * 
 * Note: This is a fallback method. For best results, use content-based detection.
 * 
 * @param pdfBuffer - The original PDF buffer
 * @returns A PDF buffer with corrected orientation
 */
export async function correctPdfOrientation(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    let needsRotation = false;
    
    // Check first page orientation (most documents are single-page)
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    // If landscape (width > height), rotate to portrait
    if (width > height) {
      needsRotation = true;
    }
    
    // If no rotation is needed, return original buffer
    if (!needsRotation) {
      return pdfBuffer;
    }
    
    // Rotate all pages that are landscape
    for (const page of pages) {
      const pageSize = page.getSize();
      if (pageSize.width > pageSize.height) {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + 90));
      }
    }
    
    // Save the corrected PDF
    const correctedPdfBytes = await pdfDoc.save();
    return Buffer.from(correctedPdfBytes);
    
  } catch (error) {
    console.error('PDF orientation correction error:', error);
    // If correction fails, return original buffer to avoid breaking the pipeline
    console.warn('Returning original PDF due to orientation correction error');
    return pdfBuffer;
  }
}

/**
 * Detects PDF orientation without modifying the document
 * Returns information about each page's orientation based on dimensions
 */
export async function detectPdfOrientation(pdfBuffer: Buffer): Promise<{
  pages: Array<{ pageNumber: number; width: number; height: number; isLandscape: boolean }>;
  needsCorrection: boolean;
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    const pageInfo = pages.map((page, index) => {
      const { width, height } = page.getSize();
      return {
        pageNumber: index + 1,
        width,
        height,
        isLandscape: width > height,
      };
    });
    
    const needsCorrection = pageInfo.some(page => page.isLandscape);
    
    return {
      pages: pageInfo,
      needsCorrection,
    };
  } catch (error) {
    console.error('PDF orientation detection error:', error);
    throw new Error(`Failed to detect PDF orientation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

