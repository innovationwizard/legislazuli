/**
 * Converts PDF to PNG image for vision API processing
 * Uses Chromium-based rendering via puppeteer-core + @sparticuz/chromium
 * This approach is reliable in serverless environments and avoids pdfjs-dist worker issues
 */

export async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  try {
    // Import puppeteer-core and chromium
    const puppeteerModule = await import('puppeteer-core');
    const chromiumModule = await import('@sparticuz/chromium');
    const puppeteer = puppeteerModule.default || puppeteerModule;
    const Chromium = chromiumModule.default || chromiumModule;
    
    // Launch browser with Chromium for serverless
    const browser = await puppeteer.launch({
      args: Chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await Chromium.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
    });
    
    try {
      // Create a new page
      const page = await browser.newPage();
      
      // Convert PDF buffer to data URL
      const pdfBase64 = pdfBuffer.toString('base64');
      const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
      
      // Load the PDF in the page
      await page.goto(dataUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      
      // Take a screenshot of the first page (PDFs render as single page by default)
      // Use high quality settings for better OCR
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false, // Just the viewport (first page)
        quality: 100,
      });
      
      // Convert screenshot buffer to base64
      if (Buffer.isBuffer(screenshot)) {
        return screenshot.toString('base64');
      } else if (screenshot instanceof Uint8Array) {
        return Buffer.from(screenshot).toString('base64');
      } else {
        throw new Error('Unexpected screenshot format');
      }
    } finally {
      // Always close the browser
      await browser.close();
    }
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
