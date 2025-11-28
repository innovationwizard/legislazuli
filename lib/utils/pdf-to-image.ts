/**
 * Converts PDF to PNG image for vision API processing
 * Uses pdfjs-dist which works in serverless environments
 */

// Polyfills for browser APIs needed by pdfjs-dist in Node.js
function setupPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // Simple DOMMatrix polyfill
    class DOMMatrixPolyfill {
      a: number = 1;
      b: number = 0;
      c: number = 0;
      d: number = 1;
      e: number = 0;
      f: number = 0;
      m11: number = 1;
      m12: number = 0;
      m21: number = 0;
      m22: number = 1;
      m41: number = 0;
      m42: number = 0;
      m13: number = 0;
      m23: number = 0;
      m31: number = 0;
      m32: number = 0;
      m33: number = 1;
      m43: number = 0;
      m14: number = 0;
      m24: number = 0;
      m34: number = 0;
      m44: number = 1;

      constructor(init?: string | number[]) {
        if (init) {
          if (typeof init === 'string') {
            // Parse matrix string
            const values = init.replace(/matrix\(|\)/g, '').split(',').map(Number);
            if (values.length >= 6) {
              this.a = values[0];
              this.b = values[1];
              this.c = values[2];
              this.d = values[3];
              this.e = values[4];
              this.f = values[5];
            }
          } else if (Array.isArray(init) && init.length >= 6) {
            this.a = init[0];
            this.b = init[1];
            this.c = init[2];
            this.d = init[3];
            this.e = init[4];
            this.f = init[5];
          }
        }
      }

      multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
        const result = new DOMMatrixPolyfill();
        result.a = this.a * other.a + this.c * other.b;
        result.b = this.b * other.a + this.d * other.b;
        result.c = this.a * other.c + this.c * other.d;
        result.d = this.b * other.c + this.d * other.d;
        result.e = this.a * other.e + this.c * other.f + this.e;
        result.f = this.b * other.e + this.d * other.f + this.f;
        return result;
      }

      translate(x: number, y: number): DOMMatrixPolyfill {
        return this.multiply(new DOMMatrixPolyfill([1, 0, 0, 1, x, y]));
      }

      scale(x: number, y?: number): DOMMatrixPolyfill {
        return this.multiply(new DOMMatrixPolyfill([x, 0, 0, y ?? x, 0, 0]));
      }

      rotate(angle: number): DOMMatrixPolyfill {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return this.multiply(new DOMMatrixPolyfill([cos, sin, -sin, cos, 0, 0]));
      }
    }
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  }

  if (typeof globalThis.ImageData === 'undefined') {
    // ImageData polyfill
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
        if (dataOrWidth instanceof Uint8ClampedArray) {
          this.data = dataOrWidth;
          this.width = widthOrHeight!;
          this.height = height!;
        } else {
          this.width = dataOrWidth;
          this.height = widthOrHeight!;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        }
      }
    }
    (globalThis as any).ImageData = ImageDataPolyfill;
  }

  if (typeof globalThis.Path2D === 'undefined') {
    // Simple Path2D polyfill
    class Path2DPolyfill {
      constructor(path?: string | Path2DPolyfill) {
        // Minimal implementation - pdfjs-dist may not use this heavily
      }
      moveTo(x: number, y: number): void {}
      lineTo(x: number, y: number): void {}
      closePath(): void {}
    }
    (globalThis as any).Path2D = Path2DPolyfill;
  }
}

export async function convertPdfToImage(pdfBuffer: Buffer): Promise<string> {
  try {
    // Setup polyfills before importing pdfjs-dist
    setupPolyfills();

    // Import canvas first and make it available globally for pdfjs-dist auto-detection
    let canvasModule: any;
    let createCanvas: any;
    
    try {
      canvasModule = await import('@napi-rs/canvas');
      createCanvas = canvasModule.createCanvas || canvasModule.default?.createCanvas;
      
      if (!createCanvas) {
        throw new Error('createCanvas not found in @napi-rs/canvas');
      }
    } catch (canvasError) {
      console.warn('Failed to load @napi-rs/canvas, PDF conversion may not work:', canvasError);
      // In serverless environments, native modules may not be available
      // We'll try to continue anyway - pdfjs-dist might have fallbacks
      throw new Error('Canvas library not available in this environment. PDF conversion requires a native canvas implementation.');
    }
    
    // Make canvas available globally before pdfjs-dist tries to auto-detect it
    if (typeof (globalThis as any).Canvas === 'undefined') {
      (globalThis as any).Canvas = createCanvas;
    }
    if (typeof (globalThis as any).createCanvas === 'undefined') {
      (globalThis as any).createCanvas = createCanvas;
    }
    
    // Also make it available via require for pdfjs-dist's internal checks
    const originalRequire = (globalThis as any).require;
    if (!originalRequire) {
      (globalThis as any).require = (id: string) => {
        if (id === '@napi-rs/canvas' || id === 'canvas') {
          return canvasModule;
        }
        throw new Error(`Cannot find module '${id}'`);
      };
    }

    // Use legacy build for Node.js environments (avoids DOMMatrix and other browser APIs)
    // The legacy build is designed for Node.js/serverless environments
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Load the PDF document with worker disabled for server-side rendering
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      verbosity: 0, // Suppress warnings
      isEvalSupported: false, // Security: disable eval
      useWorkerFetch: false, // Disable worker fetch
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
    });
    
    const pdf = await loadingTask.promise;
    
    // Get the first page (most documents are single page)
    const page = await pdf.getPage(1);
    
    // Set up viewport with good quality (2x scale for better OCR)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create canvas using @napi-rs/canvas (serverless-compatible)
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

