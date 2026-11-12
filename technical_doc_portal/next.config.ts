import type { NextConfig } from "next";

// The Content-Security-Policy (with a per-request nonce) is set in src/proxy.ts.
const securityHeaders = [
  // Browsers only ever use HTTPS for this site (ignored on plain-http localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // Other sites cannot keep a handle on portal windows, nor embed portal files.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  // Every page is per-user and authenticated, so the classic dynamic rendering
  // model is used (Cache Components disabled on purpose).
  cacheComponents: false,
  // Do not advertise the framework in an "X-Powered-By" header.
  poweredByHeader: false,
  experimental: {
    authInterrupts: true,
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Native / heavy server-only packages are loaded from node_modules at runtime.
  serverExternalPackages: [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "@node-rs/argon2",
    "tesseract.js",
    "puppeteer-core",
    "sanitize-html",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
