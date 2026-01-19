// next.config.js
/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

const imgSrc =
  "img-src 'self' data: blob: https://replicate.delivery https://*.replicate.delivery";

const devCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  imgSrc,
  "object-src 'none'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 http://azenc.local:8000 ws://localhost:3000 ws://127.0.0.1:3000 ws://azenc.local:3000",
].join("; ");

const prodCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  imgSrc,
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: isDev ? devCsp : prodCsp,
  },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    if (isDev) {
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
