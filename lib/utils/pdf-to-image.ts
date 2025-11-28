/**
 * Converts PDF to PNG image for vision API processing
 * Uses pdfjs-dist which works in serverless environments
 */

export async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  try {
    // Use legacy build for Node.js environments (avoids DOMMatrix and other browser APIs)
    // The legacy build is designed for Node.js/serverless environments
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Disable worker for server-side rendering (not needed in Node.js)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      verbosity: 0, // Suppress warnings
      isEvalSupported: false, // Security: disable eval
    });
    
    const pdf = await loadingTask.promise;
    
    // Get the first page (most documents are single page)
    const page = await pdf.getPage(1);
    
    // Set up viewport with good quality (2x scale for better OCR)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create canvas using @napi-rs/canvas (serverless-compatible)
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Fill white background (important for OCR)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, viewport.width, viewport.height);
    
    // Render the page
    // Type assertion needed because node-canvas types differ from browser canvas types
    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    } as any).promise;
    
    // Convert canvas to PNG buffer
    const imageBuffer = canvas.toBuffer('image/png');
    
    // Convert to base64
    return imageBuffer.toString('base64');
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

