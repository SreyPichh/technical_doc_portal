/**
 * Generates synthetic TEST PDFs used by the end-to-end tests. They are clearly
 * marked as test files and contain no NSK technical information.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";

async function textPdf(path: string, lines: string[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(lines[0]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let p = 0; p < 2; p++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 790, width: 595.28, height: 52, color: rgb(0.85, 0.06, 0.18) });
    page.drawText("TEST FILE - NOT AN OFFICIAL NSK DOCUMENT", { x: 40, y: 810, size: 16, font: bold, color: rgb(1, 1, 1) });
    lines.forEach((l, i) => page.drawText(l, { x: 40, y: 740 - i * 22, size: 12, font }));
    page.drawText(`Page ${p + 1} / 2`, { x: 500, y: 30, size: 9, font });
  }
  writeFileSync(path, await pdf.save());
}

async function scannedPdf(path: string) {
  // Image-only page (no text layer) to exercise OCR.
  const c = createCanvas(1240, 1754);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1240, 1754);
  ctx.fillStyle = "#000";
  ctx.font = "bold 52px sans-serif";
  ctx.fillText("TEST SCANNED DOCUMENT", 100, 200);
  ctx.font = "44px sans-serif";
  ctx.fillText("Order code QX7781234", 100, 320);
  ctx.fillText("Not an official NSK document", 100, 400);
  const png = c.toBuffer("image/png");
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  writeFileSync(path, await pdf.save());
}

async function main() {
  mkdirSync("e2e/fixtures", { recursive: true });
  await textPdf("e2e/fixtures/TEST-NEW-DOC.pdf", [
    "Document No. | TEST-99-001-EN",
    "Date | 2026-11-01",
    "Sub : E2E Test Document For Upload",
    "Product model: TESTMODEL-X1   Order code: ZZ0000001",
  ]);
  await textPdf("e2e/fixtures/TEST-049-R2.pdf", [
    "Document No. | TEC-26-049-EN-R2",
    "Date | 2026-11-04",
    "Sub : Test revision used only by automated tests",
    "Marker text: REVISION-TWO-TEST-MARKER",
  ]);
  await scannedPdf("e2e/fixtures/TEST-SCANNED.pdf");
  writeFileSync("e2e/fixtures/not-a-pdf.pdf", "This is plain text pretending to be a PDF.");
  console.log("✓ Test fixtures written to e2e/fixtures");
}
main();
