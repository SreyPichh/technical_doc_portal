import "server-only";
import { createHash } from "node:crypto";
import { normalizeText } from "@/lib/text";

export class PdfValidationError extends Error {}

export type PdfAnalysis = {
  sha256: string;
  pageCount: number;
  /** Normalised text, pages separated by \f (form feed). */
  text: string;
  textChars: number;
  /** True when the PDF has (almost) no extractable text — likely a scan. */
  likelyScanned: boolean;
  suggestions: MetadataSuggestions;
};

export type MetadataSuggestions = {
  documentNumber?: string;
  revision?: string;
  language?: string;
  releaseDate?: string;
  title?: string;
};

async function loadPdfjs() {
  // Legacy build is the Node-compatible build of PDF.js.
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export function assertLooksLikePdf(buf: Buffer) {
  const head = buf.subarray(0, 1024).toString("latin1");
  if (!head.includes("%PDF-")) throw new PdfValidationError("The file is not a valid PDF document.");
  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) throw new PdfValidationError("The PDF appears to be truncated or corrupted.");
}

export async function analyzePdf(buf: Buffer): Promise<PdfAnalysis> {
  assertLooksLikePdf(buf);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException")
      throw new PdfValidationError("The PDF is password-protected. Please upload an unprotected copy.");
    throw new PdfValidationError("The PDF could not be read. It may be corrupted.");
  }

  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let out = "";
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && Math.abs(y - lastY) > 2) out += "\n";
        else if (out && !out.endsWith(" ")) out += " ";
        out += item.str;
        lastY = y;
      }
      pages.push(normalizeText(out));
      page.cleanup();
    }
    const text = pages.join("\f");
    const textChars = text.replace(/\s/g, "").length;
    // Fewer than ~40 visible characters per page → probably image-only / scanned.
    const likelyScanned = textChars < doc.numPages * 40;
    return {
      sha256,
      pageCount: doc.numPages,
      text,
      textChars,
      likelyScanned,
      suggestions: suggestMetadata(pages[0] ?? ""),
    };
  } finally {
    await doc.destroy();
  }
}

const LANGS: Record<string, string> = {
  EN: "English",
  JA: "Japanese",
  JP: "Japanese",
  DE: "German",
  FR: "French",
  ES: "Spanish",
  IT: "Italian",
  ZH: "Chinese",
  CN: "Chinese",
  KO: "Korean",
  RU: "Russian",
  PT: "Portuguese",
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Best-effort metadata hints from the first page. The administrator always confirms them. */
export function suggestMetadata(firstPage: string): MetadataSuggestions {
  const s: MetadataSuggestions = {};
  const compact = firstPage.replace(/\s*-\s*/g, "-");
  const id = compact.match(/\b([A-Z]{2,5}-\d{2}-\d{3,4})(?:-([A-Z]{2}))?(?:-(R\d{1,2}))?\b/);
  if (id) {
    s.documentNumber = id[1];
    if (id[2]) s.language = LANGS[id[2]] ?? id[2];
    s.revision = id[3] ?? "R0";
  }
  const iso = firstPage.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) s.releaseDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else {
    const m = firstPage.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\.?\s*(\d{1,2})\s*,\s*(20\d{2})/i);
    if (m) {
      const mo = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1;
      s.releaseDate = `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }
  // "Sub : <title>" — titles may wrap onto a second short line.
  const sub = firstPage.match(/Sub\s*[:：]\s*([^\n]{3,200})(?:\n([^\n]*))?/);
  if (sub) {
    let title = sub[1].trim();
    const next = (sub[2] ?? "").trim();
    if (next && next.length < 60 && !/[:：|]/.test(next) && !/^Please\b/i.test(next) && !/[.。]$/.test(title)) {
      title = `${title} ${next}`;
    }
    s.title = title.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  }
  return s;
}
