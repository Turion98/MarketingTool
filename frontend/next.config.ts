const isDev = process.env.NODE_ENV !== "production";

const devCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // HMR + lokál API + websockets
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 ws://localhost:3000 ws://127.0.0.1:3000",
].join("; ");

const prodCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",              // ha lehet, vedd ki az 'unsafe-*'-ket prodban
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "geolocation=()" },
  // HSTS maradhat, de localhoston úgysem számít
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: isDev ? devCsp : prodCsp },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
