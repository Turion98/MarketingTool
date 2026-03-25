// next.config.js
/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Security headers (CSP, X-Frame-Options, …) are set in middleware.ts so /embed/*
  // can omit framing restrictions without conflicting catch-all rules from headers().
  async rewrites() {
    if (isDev) {
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
      ];
    }

    return [
      {
        source: "/api/analytics/:path*",
        destination: "https://api.thequestell.com/api/analytics/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
