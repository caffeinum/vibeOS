import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/claude-code'],
  },
};

export default nextConfig;
