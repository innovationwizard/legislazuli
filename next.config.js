/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude native binaries from bundling
      config.externals = [...(config.externals || []), {
        '@napi-rs/canvas': '@napi-rs/canvas',
        'canvas': '@napi-rs/canvas',
      }];
      
      // Ignore native binary files
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /\.node$/,
        use: 'ignore-loader',
      });
    }
    return config;
  },
};

module.exports = nextConfig;

