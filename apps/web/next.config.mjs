/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@voice-agent/ui', '@voice-agent/contracts'],
  reactStrictMode: true,
};

export default nextConfig;
