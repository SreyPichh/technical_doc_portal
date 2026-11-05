import { NextResponse } from "next/server";
import { assertPermission } from "@/server/auth/dal";
import { env } from "@/server/env";
import { assertSameOrigin, handleRouteError, jsonError } from "@/server/http";
import { PdfValidationError } from "@/server/pdf/analyze";
import { stageUpload } from "@/server/services/revisions";

export const runtime = "nodejs";

/**
 * Step 1 of the upload workflow: receives a PDF, validates and analyses it
 * (page count, text extraction, checksum, metadata hints) and stores it as a
 * staged upload. Nothing is visible to dealers until a revision is published.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("documents.upload");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > env.maxUploadBytes + 1024 * 64) return jsonError(413, `The file exceeds the ${env.MAX_UPLOAD_MB} MB limit.`);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "No file received.");
    if (file.size === 0) return jsonError(400, "The file is empty.");
    if (file.size > env.maxUploadBytes) return jsonError(413, `The file exceeds the ${env.MAX_UPLOAD_MB} MB limit.`);
    if (!/\.pdf$/i.test(file.name)) return jsonError(415, "Only PDF files (.pdf) can be uploaded.");
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await stageUpload(buf, file.name, user);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PdfValidationError) return jsonError(422, e.message);
    return handleRouteError(e);
  }
}
