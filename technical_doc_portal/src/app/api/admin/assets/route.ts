import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assertPermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { assertSameOrigin, handleRouteError, jsonError } from "@/server/http";
import { newKey, storage } from "@/server/storage";

export const runtime = "nodejs";

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

/** Image upload for the rich-text editor. SVG is intentionally not accepted (script risk). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("documents.author");
    const form = await req.formData();
    const file = form.get("file");
    const documentId = String(form.get("documentId") ?? "");
    if (!(file instanceof File)) return jsonError(400, "No file received.");
    if (file.size > 10 * 1024 * 1024) return jsonError(413, "Images must be 10 MB or smaller.");
    const t = TYPES[file.type];
    const buf = Buffer.from(await file.arrayBuffer());
    if (!t || !t.magic(buf)) return jsonError(415, "Use a PNG, JPEG, GIF or WebP image.");
    if (documentId) {
      const [doc] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.id, documentId));
      if (!doc) return jsonError(404, "Document not found.");
    }
    const key = newKey("assets", t.ext);
    await storage.put(key, buf, file.type);
    const [a] = await db
      .insert(schema.assets)
      .values({ fileKey: key, mimeType: file.type, fileSize: buf.length, uploadedBy: user.id, documentId: documentId || null })
      .returning({ id: schema.assets.id });
    return NextResponse.json({ id: a.id, url: `/api/assets/${a.id}` });
  } catch (e) {
    return handleRouteError(e);
  }
}
