/** @type {import('next').NextConfig} */

// Környezet detektálása
const isDev = process.env.NODE_ENV !== "production";

// ✅ Fejlesztői CSP – engedi HMR-t, lokál API-kat, websocketet
const devCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  // ⬇️ kiegészítve az azenc.local-lal
  "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 http://azenc.local:8000 ws://localhost:3000 ws://127.0.0.1:3000 ws://azenc.local:3000",
].join("; ");

// ✅ Production CSP – minimalizált, nincs unsafe-eval / inline JS
const prodCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // inline stílusokat engedjük, amíg Tailwind / CSS-in-JS kell
  "connect-src 'self'",
].join("; ");

// ✅ Alap biztonsági fejlécek
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: isDev ? devCsp : prodCsp },
];

// ✅ Teljes Next.js konfiguráció – env + security + strict mode + (opcionális) dev proxy
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.NEXT_PUBLIC_AUTH_PROVIDER,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    // Opcionális: dev proxy, hogy a fetch("/api/...") → FastAPI-ra menjen
    if (isDev) {
      return [
        { source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
