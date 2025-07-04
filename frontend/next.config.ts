import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8000',
  },
  eslint: {
    // Allow build to continue with warnings
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow build to continue with type errors during builds
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
