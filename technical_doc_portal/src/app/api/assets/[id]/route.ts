import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { can } from "@/lib/permissions";
import { handleRouteError, jsonError } from "@/server/http";
import { canViewDocumentInPortal } from "@/server/services/access";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

/** Images used in authored documents. Same visibility rules as the document itself. */
export async function GET(_req: Request, ctx: RouteContext<"/api/assets/[id]">) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "Please sign in.");
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Not found.");
    const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, id));
    if (!a) return jsonError(404, "Not found.");
    const staff = can(user.role, "documents.view_all");
    if (!staff && (!a.documentId || !(await canViewDocumentInPortal(user, a.documentId))))
      return jsonError(404, "Not found.");
    const { body, size } = await storage.stream(a.fileKey);
    return new Response(body, {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(size),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
