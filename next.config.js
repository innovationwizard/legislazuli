/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Mark these as external packages for serverless compatibility
    serverComponentsExternalPackages: [
      '@aws-sdk/client-textract',
      'puppeteer-core',
      '@sparticuz/chromium',
      'sharp',
      'pdf-lib',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // CRITICAL: Don't ignore .node files for Chromium - they need to be included
      // The binary must survive the build process for Vercel Lambda
      // Only ignore problematic native modules, not Chromium
      
      // Ensure @sparticuz/chromium binaries are preserved
      // These packages are already in serverComponentsExternalPackages above
      // which tells Next.js not to bundle them, preserving the binary structure
    }
    return config;
  },
};

module.exports = nextConfig;

