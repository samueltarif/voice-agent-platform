/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@voice-agent/ui', '@voice-agent/contracts', '@voice-agent/database'],
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
