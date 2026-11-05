import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { storage } from "@/server/storage";
import { normalizeText } from "@/lib/text";
import { logActivity } from "./activity";
import { rebuildSearchText } from "./documents";

const MAX_OCR_PAGES = 60;

/**
 * OCR for scanned PDFs. The original PDF is never modified — recognised text is
 * stored alongside the revision and used only for search. Runs in the
 * background (called from `after()`); progress is reflected in ocr_status.
 */
export async function runOcrJob(revisionId: string, userId: string) {
  const [rev] = await db.select().from(schema.documentRevisions).where(eq(schema.documentRevisions.id, revisionId));
  if (!rev?.fileKey) return;
  const started = Date.now();
  try {
    const buf = await storage.get(rev.fileKey);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createWorker } = await import("tesseract.js");
    const cachePath = path.resolve(env.OCR_CACHE_DIR);
    await mkdir(cachePath, { recursive: true });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const worker = await createWorker(env.OCR_LANGS.split(/[+,]/).join("+"), 1, { cachePath });
    const pages: string[] = [];
    try {
      const n = Math.min(doc.numPages, MAX_OCR_PAGES);
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.2 }); // ~160 dpi — good accuracy for A4 text
        // PDF.js's Node canvas factory (backed by @napi-rs/canvas).
        const factory = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: unknown; context: unknown } } })
          .canvasFactory;
        const cc = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({
          canvas: cc.canvas as HTMLCanvasElement,
          canvasContext: cc.context as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const png = (cc.canvas as { toBuffer(type: string): Buffer }).toBuffer("image/png");
        const { data } = await worker.recognize(png);
        pages.push(normalizeText(data.text));
        page.cleanup();
      }
    } finally {
      await worker.terminate();
      await doc.destroy();
    }
    const text = pages.join("\f");
    await db.transaction(async (tx) => {
      await tx
        .update(schema.documentRevisions)
        .set({ extractedText: text, textSource: "ocr", ocrStatus: "done" })
        .where(eq(schema.documentRevisions.id, rev.id));
      await rebuildSearchText(tx, rev.documentId);
      await logActivity(
        {
          userId,
          action: "revision.ocr",
          documentId: rev.documentId,
          entityType: "revision",
          entityId: rev.id,
          description: `OCR completed for revision ${rev.revisionNumber}: ${text.replace(/\s/g, "").length} characters recognised in ${pages.length} page(s) (${Math.round((Date.now() - started) / 1000)}s)`,
        },
        tx,
      );
    });
  } catch (e) {
    console.error("[ocr]", e);
    await db.update(schema.documentRevisions).set({ ocrStatus: "failed" }).where(eq(schema.documentRevisions.id, rev.id));
    await logActivity({
      userId,
      action: "revision.ocr",
      documentId: rev.documentId,
      entityType: "revision",
      entityId: rev.id,
      description: `OCR failed for revision ${rev.revisionNumber}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
    });
  }
}
