// Copies the PDF.js worker, CMaps (needed for CJK fonts), standard fonts and
// WASM decoders to /public/pdfjs so the browser viewer can load them.
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/pdfjs-dist");
const dest = path.resolve("public/pdfjs");
if (!existsSync(src)) process.exit(0);
await mkdir(dest, { recursive: true });
await cp(path.join(src, "build/pdf.worker.min.mjs"), path.join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(path.join(src, dir))) await cp(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
console.log("✓ PDF.js assets copied to public/pdfjs");
