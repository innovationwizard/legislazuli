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
    const chromium = chromiumModule.default || chromiumModule;

    // Configure Chromium for Vercel/serverless
    // @sparticuz/chromium v141 requires specific configuration
    let executablePath: string;

    // Check if running locally or in Vercel
    const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

    if (isLocal) {
      // For local development, use system Chrome/Chromium
      executablePath = process.env.CHROMIUM_PATH ||
        process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/chromium-browser';
    } else {
      // For Vercel/production, use @sparticuz/chromium
      try {
        // Set required environment variables for @sparticuz/chromium
        if (!process.env.FONTCONFIG_PATH) {
          process.env.FONTCONFIG_PATH = '/tmp';
        }

        executablePath = await chromium.executablePath();
      } catch (chromiumPathError) {
        console.error('Failed to get Chromium executable path:', chromiumPathError);
        throw new Error(
          'Chromium not available in serverless environment. ' +
          'This is a deployment configuration issue. Please contact support.'
        );
      }
    }

    // Launch browser with Chromium for serverless
    const browser = await puppeteer.launch({
      args: isLocal
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : [
            ...chromium.args,
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-sandbox',
            '--single-process',
            '--no-zygote',
          ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      headless: true,
    });

    try {
      // Create a new page
      const page = await browser.newPage();

      // Instead of using data URI (which Chromium may block), write PDF to temp file
      // For serverless environments, use /tmp directory
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `pdf_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
      
      // Write PDF buffer to temp file
      fs.writeFileSync(tempFilePath, pdfBuffer);
      
      // Load the PDF from file:// URL (more reliable than data URI)
      const fileUrl = `file://${tempFilePath}`;
      
      try {
        // Load the PDF in the page
        // Reduced timeout for Hobby plan (10s function limit)
        // Consider upgrading to Pro plan for better performance
        await page.goto(fileUrl, {
          waitUntil: 'networkidle0',
          timeout: 8000, // 8 seconds max to leave time for screenshot and cleanup
        });
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
      }

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
