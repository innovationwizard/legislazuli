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
      // Ignore native binary files
      config.module.rules.push({
        test: /\.node$/,
        use: 'ignore-loader',
      });

      // Ensure @sparticuz/chromium binaries are included
      config.externals = [...(config.externals || [])];
    }
    return config;
  },
  // Ensure output is standalone for better Vercel compatibility
  output: process.env.VERCEL ? 'standalone' : undefined,
};

module.exports = nextConfig;

