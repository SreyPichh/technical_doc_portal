import "server-only";
import { generateHTML } from "@tiptap/html/server";
import sanitizeHtml from "sanitize-html";
import { baseExtensions } from "@/lib/editor/extensions";

/**
 * Renders stored TipTap JSON to HTML for dealers/printing, then sanitises it
 * with a strict allow-list (defence in depth — content is admin-authored).
 */
export function renderAuthoredHtml(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  let html: string;
  try {
    html = generateHTML(content as Parameters<typeof generateHTML>[0], baseExtensions());
  } catch (e) {
    console.error("[authored] render failed", e);
    return null;
  }
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote",
      "ul", "ol", "li", "a", "hr", "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
      "figure", "figcaption", "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "style"],
      figure: ["data-figure", "data-align", "data-width"],
      figcaption: ["style"],
      hr: ["data-page-break"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      col: ["style"],
      table: ["style"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        width: [/^\d+(\.\d+)?(px|%)$/],
        "min-width": [/^\d+(\.\d+)?px$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    // Images may only come from the portal's own authenticated asset route.
    exclusiveFilter: (frame) => frame.tag === "img" && !/^\/api\/assets\/[0-9a-f-]{36}$/i.test(frame.attribs.src ?? ""),
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });
}

export function extractAuthoredText(content: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (node.text) out.push(node.text);
    if (node.type === "figure" && node.attrs?.caption) out.push(String(node.attrs.caption));
    node.content?.forEach(walk);
    if (node.type && ["paragraph", "heading", "tableRow", "listItem"].includes(node.type)) out.push("\n");
  };
  walk(content);
  return out.join(" ").replace(/ *\n */g, "\n").trim();
}
