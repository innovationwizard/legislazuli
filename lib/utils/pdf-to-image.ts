/**
 * Converts PDF to PNG image for vision API processing
 * Uses pdfjs-dist with @napi-rs/canvas for rendering
 * Simplified approach to avoid worker complexity
 */

export async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  try {
    // Import canvas first
    const { createCanvas } = await import('@napi-rs/canvas');
    
    // Import pdfjs-dist legacy build
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Load the PDF document
    // Use minimal options to avoid worker issues
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0, // Suppress warnings
      useSystemFonts: true,
      isEvalSupported: false,
      // Disable all worker-related features
      useWorkerFetch: false,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
    });
    
    const pdf = await loadingTask.promise;
    
    // Get the first page (most documents are single page)
    const page = await pdf.getPage(1);
    
    // Set up viewport with good quality (2x scale for better OCR)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create canvas using @napi-rs/canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Fill white background (important for OCR)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, viewport.width, viewport.height);
    
    // Render the page directly without worker
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
      canvas: canvas as any, // Required by pdfjs-dist render method
    };
    
    await page.render(renderContext).promise;
    
    // Convert canvas to PNG buffer
    const imageBuffer = canvas.toBuffer('image/png');
    
    // Convert to base64
    return imageBuffer.toString('base64');
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
