/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Mark these as external packages for serverless compatibility
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
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
    }
    return config;
  },
};

module.exports = nextConfig;

