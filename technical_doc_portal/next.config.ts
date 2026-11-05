import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Every page is per-user and authenticated, so the classic dynamic rendering
  // model is used (Cache Components disabled on purpose).
  cacheComponents: false,
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
