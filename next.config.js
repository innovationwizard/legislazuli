/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Mark these as external packages for serverless compatibility
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Handle JSON files in pdfjs-dist
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /pdfjs-dist[\\/].*\.json$/,
        type: 'json',
      });
      
      // Ignore native binary files (but allow @napi-rs/canvas to handle its own)
      config.module.rules.push({
        test: /\.node$/,
        use: 'ignore-loader',
      });
    }
    return config;
  },
};

module.exports = nextConfig;

