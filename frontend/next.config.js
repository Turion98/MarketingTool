// next.config.js
/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

/** Dev CORS workaround — must match app/lib/publicApiBase.ts QUESTELL_DEV_API_PROXY_PATH */
const DEV_API_PROXY_SOURCE = "/_questell-api-proxy/:path*";

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Security headers (CSP, X-Frame-Options, …) are set in middleware.ts so /embed/*
  // can omit framing restrictions without conflicting catch-all rules from headers().
  async rewrites() {
    if (isDev) {
      const apiBase = (
        process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000"
      ).replace(/\/+$/, "");
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
        {
          source: DEV_API_PROXY_SOURCE,
          destination: `${apiBase}/:path*`,
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
