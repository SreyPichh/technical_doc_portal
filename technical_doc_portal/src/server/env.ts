import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("NSK Technical Information Portal"),
  /** "local" (private folder on disk) or "s3" (any S3-compatible bucket, kept private). */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  /** Secure cookies require HTTPS. Defaults to true in production. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /** Path to a Chrome/Chromium binary; enables server-side PDF export of authored documents. */
  CHROME_EXECUTABLE_PATH: z.string().optional(),
  /** Where tesseract.js language data is cached. Downloaded on first OCR run. */
  OCR_CACHE_DIR: z.string().default("./storage/.ocr-cache"),
  OCR_LANGS: z.string().default("eng"),
});

// `next build` imports server modules without runtime secrets; validate for real at runtime.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const parsed = schema.safeParse(
  isBuild ? { DATABASE_URL: "postgres://build-placeholder/none", ...process.env } : process.env,
);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — see .env.example");
}

export const env = {
  ...parsed.data,
  cookieSecure:
    parsed.data.COOKIE_SECURE !== undefined
      ? parsed.data.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
  emailConfigured: Boolean(parsed.data.RESEND_API_KEY && parsed.data.EMAIL_FROM),
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024,
};
