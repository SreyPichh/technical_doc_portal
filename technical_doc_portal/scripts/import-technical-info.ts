/**
 * Bulk import of official technical information PDFs, using an Excel list for the metadata.
 *
 *   npm run import:ti -- --excel "<list.xlsm>" --pdfs "<folder>" [--pdfs "<folder>" …] [options]
 *
 * Runs as a PREVIEW by default: it reads the Excel sheet and the folders, checks every PDF,
 * and prints what would be imported — nothing is changed. Add --commit to import.
 *
 * Options
 *   --sheet <name>            Excel sheet to read (default "NAS")
 *   --as <email>              Administrator recorded as the uploader/publisher (default: SEED_ADMIN_EMAIL)
 *   --category <slug>         Category for every document (default "general-technical-information").
 *                             A "Category" column in the sheet, if present, takes precedence per row.
 *   --include-unlisted        Also import PDFs that are not in the sheet, using the title/date read from the PDF.
 *   --include-highlighted     Also import rows highlighted in yellow (by default they are left out, together
 *                             with their PDFs; a yellow first row leaves out the whole document).
 *   --commit                  Actually import.
 *   --env-file <path>         Load settings from this file instead of .env.local (e.g. .env.deploy).
 *
 * What the import does (through the normal upload/publish services):
 *   - each document is created from its first revision (R0) and published with its Excel release date
 *     as the publication date, then later revisions (R1, R2 …) are added and published in order —
 *     so the revision history and NEW/UPDATED labels are the same as if they had been published then;
 *   - the PDFs are stored unchanged and their text is indexed for search;
 *   - no e-mails are sent; documents or revisions that already exist are skipped (safe to re-run).
 */
import { config } from "dotenv";
const envFileArg = process.argv.indexOf("--env-file");
if (envFileArg > 0) config({ path: process.argv[envFileArg + 1], override: true });
config({ path: ".env.local" });
config();

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

/* ------------------------------ arguments ------------------------------ */

function args() {
  const a = process.argv.slice(2);
  const many = (flag: string) => a.flatMap((v, i) => (a[i - 1] === flag ? [v] : []));
  const one = (flag: string, fallback?: string) => many(flag).at(-1) ?? fallback;
  return {
    excel: one("--excel"),
    pdfDirs: many("--pdfs"),
    sheet: one("--sheet", "NAS")!,
    as: one("--as", process.env.SEED_ADMIN_EMAIL),
    category: one("--category", "general-technical-information")!,
    includeUnlisted: a.includes("--include-unlisted"),
    includeHighlighted: a.includes("--include-highlighted"),
    commit: a.includes("--commit"),
  };
}

/* ------------------------------ Excel ------------------------------ */

type SheetRevision = { revision: string; releaseDate: string | null; note: string | null; row: number };
type SheetDocument = {
  number: string;
  title: string;
  language: string;
  type: string;
  product: string;
  category: string | null;
  revisions: SheetRevision[];
};

const LANG: Record<string, string> = { E: "English", J: "Japanese" };

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in o) return cellText(o.text);
    return "";
  }
  return String(v).trim();
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "2025-01-14", a real Excel date, or "Jan. 26, 2006" → "YYYY-MM-DD". */
function toIsoDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  return null;
}

/** A row highlighted in yellow (any cell of the row filled yellow) is not to be published. */
function isYellow(row: { eachCell: (opt: { includeEmpty: boolean }, cb: (c: { fill?: unknown }) => void) => void }) {
  let yellow = false;
  row.eachCell({ includeEmpty: false }, (c) => {
    const f = c.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
    if (f?.type === "pattern" && f.pattern !== "none" && /^(FF)?FFFF00$/i.test(f.fgColor?.argb ?? "")) yellow = true;
  });
  return yellow;
}

async function readSheet(file: string, sheetName: string, includeHighlighted = false) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file); // values only — macros in .xlsm files are never run
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  // The header row is the first row with a "Tech Info No." cell. Columns are read from that row
  // only, leftmost match first (some sheets keep drop-down lists with a "Type" heading further right).
  const NUMBER_HEADER = /^tech\.? ?info\.? ?no\.?$/;
  let headerRow = 0;
  ws.eachRow((row, r) => {
    if (!headerRow && row.values && (row.values as unknown[]).some((v) => NUMBER_HEADER.test(cellText(v).toLowerCase()))) headerRow = r;
  });
  if (!headerRow) throw new Error(`No "Tech Info No." header found in sheet "${sheetName}".`);
  const col: Record<string, number> = {};
  ws.getRow(headerRow).eachCell((c, n) => {
    const t = cellText(c.value).toLowerCase();
    if (NUMBER_HEADER.test(t)) col.number ??= n;
    else if (t === "e/j") col.lang ??= n;
    else if (t === "title") col.title ??= n;
    else if (t === "release date" || t === "date") col.date ??= n;
    else if (t === "type") col.type ??= n;
    else if (t === "product") col.product ??= n;
    else if (t === "category") col.category ??= n;
  });
  for (const k of ["number", "title", "date", "type", "product"])
    if (!col[k]) throw new Error(`Column for "${k}" not found in sheet "${sheetName}".`);

  const docs = new Map<string, SheetDocument>();
  const problems: string[] = [];
  /** Yellow rows: "TEC-25-004" (whole document) or "TEC-26-033 R1" (that revision only). */
  const highlighted: { number: string; revision: string; row: number; title: string }[] = [];
  const highlightedNumbers = new Set<string>();
  ws.eachRow((row, r) => {
    if (r <= headerRow) return;
    const get = (k: string) => (col[k] ? cellText(row.getCell(col[k]).value) : "");
    const number = get("number").toUpperCase();
    if (!number) return;
    if (!/^TEC-\d{2}-\d{3}$/.test(number)) return void problems.push(`Row ${r}: "${number}" is not a TEC-YY-NNN number — skipped.`);
    const rawTitle = get("title");
    const releaseDate = toIsoDate(get("date"));
    if (!releaseDate) problems.push(`Row ${r}: ${number} has no readable release date ("${get("date")}").`);
    const revMatch = rawTitle.match(/^(R\d+)\b\s*(.*)$/i);
    if (!includeHighlighted && (highlightedNumbers.has(number) || isYellow(row))) {
      if (!revMatch) highlightedNumbers.add(number);
      return void highlighted.push({ number, revision: revMatch ? revMatch[1].toUpperCase() : "R0", row: r, title: rawTitle });
    }
    const existing = docs.get(number);
    if (revMatch) {
      if (!existing) return void problems.push(`Row ${r}: ${number} ${revMatch[1]} appears before its first row — skipped.`);
      existing.revisions.push({ revision: revMatch[1].toUpperCase(), releaseDate, note: revMatch[2].trim() || null, row: r });
      return;
    }
    if (existing) return void problems.push(`Row ${r}: ${number} is listed twice — the second row is ignored.`);
    docs.set(number, {
      number,
      title: rawTitle,
      language: LANG[get("lang").toUpperCase()] ?? "English",
      type: get("type"),
      product: get("product"),
      category: get("category") || null,
      revisions: [{ revision: "R0", releaseDate, note: null, row: r }],
    });
  });
  const isHighlighted = (n: string, rev: string) => highlightedNumbers.has(n) || highlighted.some((h) => h.number === n && h.revision === rev);
  return { docs, problems, highlighted, isHighlighted };
}

/** "Surgic Pro2 OPT, Surgic Pro2 NON-OPT, etc." → ["Surgic Pro2 OPT", "Surgic Pro2 NON-OPT"] */
function productModels(product: string) {
  return product
    .split(/,(?![^(]*\))/) // commas outside parentheses
    .map((p) => p.replace(/\betc\.?$/i, "").replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^etc\.?$/i.test(p))
    .slice(0, 50);
}

/* ------------------------------ PDF folders ------------------------------ */

type PdfFile = { path: string; name: string; number: string; revision: string };

async function scanPdfs(dirs: string[]) {
  const files: PdfFile[] = [];
  const unrecognised: string[] = [];
  for (const dir of dirs) {
    for (const name of (await readdir(dir)).sort()) {
      if (!name.toLowerCase().endsWith(".pdf")) continue;
      const m = name.match(/(TEC-\d{2}-\d{3})[_-](?:EN|JA|JP)(?:[_-](R\d+))?/i);
      if (!m) {
        unrecognised.push(path.join(dir, name));
        continue;
      }
      files.push({ path: path.join(dir, name), name, number: m[1].toUpperCase(), revision: (m[2] ?? "R0").toUpperCase() });
    }
  }
  return { files, unrecognised };
}

/* ------------------------------ main ------------------------------ */

async function main() {
  const opt = args();
  if (!opt.excel || !opt.pdfDirs.length) {
    console.error('Usage: npm run import:ti -- --excel "<list.xlsm>" --pdfs "<folder>" [--pdfs "<folder>"] [--commit]');
    process.exit(1);
  }

  const { db, schema } = await import("@/server/db");
  const { sql, inArray } = await import("drizzle-orm");
  const { analyzePdf } = await import("@/server/pdf/analyze");
  const { stageUpload, createDocumentFromUpload, addRevisionFromUpload } = await import("@/server/services/revisions");
  const { env } = await import("@/server/env");

  const target = new URL(env.DATABASE_URL);
  console.log(`\n${opt.commit ? "IMPORT" : "PREVIEW (nothing will be changed — add --commit to import)"}`);
  console.log(`Database: ${target.hostname}${target.pathname}   Storage: ${env.STORAGE_DRIVER}\n`);

  const { docs, problems, highlighted, isHighlighted } = await readSheet(opt.excel, opt.sheet, opt.includeHighlighted);
  const scan = await scanPdfs(opt.pdfDirs);
  const { unrecognised } = scan;
  // PDFs of yellow rows are left out entirely (so --include-unlisted does not bring them back).
  const files = scan.files.filter((f) => !isHighlighted(f.number, f.revision));
  const highlightedFiles = scan.files.filter((f) => isHighlighted(f.number, f.revision));
  const fileFor = (n: string, rev: string) => files.find((f) => f.number === n && f.revision === rev);

  // Reference data
  const categories = await db.select().from(schema.categories);
  const defaultCategory = categories.find((c) => c.slug === opt.category && !c.parentId);
  if (!defaultCategory) throw new Error(`Category "${opt.category}" not found.`);
  const types = await db.select().from(schema.documentTypes);
  const existingDocs = await db
    .select({ id: schema.documents.id, number: schema.documents.documentNumber })
    .from(schema.documents)
    .where(inArray(schema.documents.documentNumber, [...new Set([...docs.keys(), ...scan.files.map((f) => f.number), ...highlighted.map((h) => h.number)])]));
  const existingRevs = existingDocs.length
    ? await db
        .select({ documentId: schema.documentRevisions.documentId, revision: schema.documentRevisions.revisionNumber, sha256: schema.documentRevisions.sha256 })
        .from(schema.documentRevisions)
        .where(inArray(schema.documentRevisions.documentId, existingDocs.map((d) => d.id)))
    : [];
  const docIdByNumber = new Map(existingDocs.map((d) => [d.number, d.id]));
  const hasRev = (n: string, rev: string) => {
    const id = docIdByNumber.get(n);
    return Boolean(id && existingRevs.some((r) => r.documentId === id && r.revision.toUpperCase() === rev));
  };

  // Plan
  type Step = { doc: SheetDocument; rev: SheetRevision; file: PdfFile; categoryId: string; categoryName: string };
  const steps: Step[] = [];
  const skipped: string[] = [];
  const missingFiles: string[] = [];
  for (const doc of docs.values()) {
    const wanted = doc.category?.toLowerCase();
    const cat: typeof defaultCategory =
      (wanted && categories.find((c) => !c.parentId && (c.name.toLowerCase() === wanted || c.slug === wanted))) || defaultCategory;
    if (doc.category && cat === defaultCategory && doc.category.toLowerCase() !== defaultCategory.name.toLowerCase())
      problems.push(`${doc.number}: category "${doc.category}" not found — using "${defaultCategory.name}".`);
    for (const rev of doc.revisions) {
      const file = fileFor(doc.number, rev.revision);
      if (hasRev(doc.number, rev.revision)) skipped.push(`${doc.number} ${rev.revision} — already in the portal`);
      else if (!file) missingFiles.push(`${doc.number} ${rev.revision} (sheet row ${rev.row}) — no PDF found`);
      else steps.push({ doc, rev, file, categoryId: cat.id, categoryName: cat.name });
    }
  }
  // PDFs whose number + revision is not in the sheet.
  const unlisted = files.filter((f) => !docs.get(f.number)?.revisions.some((r) => r.revision === f.revision));

  // Check every PDF that would be imported (real PDF, pages, text, duplicates).
  console.log(`Sheet "${opt.sheet}": ${docs.size} documents, ${[...docs.values()].reduce((n, d) => n + d.revisions.length, 0)} revisions`);
  console.log(`PDF folders: ${files.length} PDFs\n`);
  const checks = new Map<string, Awaited<ReturnType<typeof analyzePdf>>>();
  for (const f of [...steps.map((s) => s.file), ...unlisted]) {
    try {
      checks.set(f.path, await analyzePdf(await readFile(f.path)));
    } catch (e) {
      problems.push(`${f.name}: not a readable PDF (${e instanceof Error ? e.message : e}) — skipped.`);
    }
  }
  const knownHashes = new Map(existingRevs.filter((r) => r.sha256).map((r) => [r.sha256!, existingDocs.find((d) => d.id === r.documentId)?.number]));

  const newTypes = [...new Set([...docs.values()].map((d) => d.type).filter(Boolean))].filter(
    (t) => !types.some((x) => x.name.toLowerCase() === t.toLowerCase()),
  );

  // Report
  console.log(`To import: ${steps.filter((s) => checks.has(s.file.path)).length} revisions`);
  for (const s of steps) {
    const a = checks.get(s.file.path);
    if (!a) continue;
    const dup = knownHashes.get(a.sha256);
    console.log(
      `  ${s.doc.number} ${s.rev.revision.padEnd(3)} ${s.rev.releaseDate ?? "no date  "}  ${s.doc.type.padEnd(27)} ${String(a.pageCount).padStart(2)}p` +
        `${a.likelyScanned ? "  [scanned — OCR recommended]" : ""}${dup ? `  [same file already stored as ${dup}]` : ""}  ${s.doc.title}`,
    );
  }
  console.log(`\nCategory: ${[...new Set(steps.map((s) => s.categoryName))].join(", ") || "—"}`);
  if (newTypes.length) console.log(`New document types to create: ${newTypes.join(", ")}`);
  if (skipped.length) console.log(`\nAlready in the portal (skipped):\n  ${skipped.join("\n  ")}`);
  if (missingFiles.length) console.log(`\nIn the sheet but no PDF:\n  ${missingFiles.join("\n  ")}`);
  if (unlisted.length) {
    console.log(`\nPDFs not in the sheet${opt.includeUnlisted ? " (will be imported from the PDF's own title/date)" : " (not imported — add --include-unlisted to import them)"}:`);
    for (const f of unlisted) {
      const a = checks.get(f.path);
      const dup = a && knownHashes.get(a.sha256);
      const already = hasRev(f.number, f.revision) ? "  [already in the portal]" : "";
      console.log(`  ${f.name}  →  ${a?.suggestions.title ?? "(title not found)"}  ${a?.suggestions.releaseDate ?? ""}${already}${dup ? `  [same file already stored as ${dup}]` : ""}`);
    }
  }
  if (highlighted.length) {
    console.log(`\nHighlighted in yellow in the sheet (not imported):`);
    for (const h of highlighted) {
      const pdf = highlightedFiles.find((f) => f.number === h.number && f.revision === h.revision);
      const inPortal = hasRev(h.number, h.revision) ? "  [ALREADY IN THE PORTAL — remove it there if it should not be published]" : "";
      console.log(`  ${h.number} ${h.revision.padEnd(3)} (row ${h.row})  ${h.title}${pdf ? `  — ${pdf.name} left out` : ""}${inPortal}`);
    }
  }
  if (unrecognised.length) console.log(`\nFile names without a TEC number (ignored):\n  ${unrecognised.join("\n  ")}`);
  if (problems.length) console.log(`\nNotes:\n  ${problems.join("\n  ")}`);

  if (!opt.commit) {
    console.log("\nPreview only. Re-run with --commit to import.");
    process.exit(0);
  }

  /* ------------------------------ import ------------------------------ */

  const [admin] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${String(opt.as).toLowerCase()}`);
  if (!admin || !["super_admin", "admin"].includes(admin.role)) throw new Error(`Administrator "${opt.as}" not found.`);
  const user = {
    id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role, dealerName: admin.dealerName,
    regionId: admin.regionId, mustChangePassword: false, emailNotifications: admin.emailNotifications,
  };

  // Document types used by the sheet ("Design Change", "Service Information", …).
  for (const name of newTypes) {
    const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(${schema.documentTypes.displayOrder}), 0)::int` }).from(schema.documentTypes);
    await db.insert(schema.documentTypes).values({ name, displayOrder: maxOrder + 1 });
  }
  const allTypes = await db.select().from(schema.documentTypes);
  const typeId = (name: string) =>
    (allTypes.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? allTypes.find((t) => t.name === "Technical Information") ?? allTypes[0]).id;

  // Type for a PDF that is not in the sheet, following the sheet's own convention:
  // "Design Change of …" → Design Change, …; every "Notice of …" title in the sheet is Service Information.
  const sheetTypes = [...new Set([...docs.values()].map((d) => d.type).filter(Boolean))].sort((x, y) => y.length - x.length);
  const typeFromTitle = (title: string) =>
    sheetTypes.find((t) => title.toLowerCase().startsWith(t.toLowerCase())) ??
    (/^notice of\b/i.test(title) && sheetTypes.includes("Service Information") ? "Service Information" : "Technical Information");

  // Unlisted PDFs become documents described by their own first page (title and date).
  if (opt.includeUnlisted) {
    for (const f of unlisted) {
      const a = checks.get(f.path);
      if (!a || docs.has(f.number) || hasRev(f.number, f.revision)) continue;
      const title = a.suggestions.title ?? f.number;
      const doc: SheetDocument = {
        number: f.number, title, language: "English", type: typeFromTitle(title),
        product: "", category: null, revisions: [{ revision: f.revision, releaseDate: a.suggestions.releaseDate ?? null, note: null, row: 0 }],
      };
      steps.push({ doc, rev: doc.revisions[0], file: f, categoryId: defaultCategory.id, categoryName: defaultCategory.name });
    }
  }

  // Oldest revision first within each document, so R1 supersedes R0 like a normal update.
  steps.sort((x, y) => x.doc.number.localeCompare(y.doc.number) || x.rev.revision.localeCompare(y.rev.revision, undefined, { numeric: true }));
  let done = 0;
  const failed: string[] = [];
  for (const s of steps) {
    const label = `${s.doc.number} ${s.rev.revision}`;
    if (!checks.has(s.file.path)) continue;
    try {
      const buf = await readFile(s.file.path);
      const staged = await stageUpload(buf, s.file.name, user, { purgeStale: false });
      const publishedAt = s.rev.releaseDate ? new Date(`${s.rev.releaseDate}T12:00:00Z`) : undefined;
      const revision = {
        revisionNumber: s.rev.revision,
        releaseDate: s.rev.releaseDate,
        revisionNotes: [
          s.rev.row
            ? `Imported from "${path.basename(opt.excel)}" (sheet ${opt.sheet}, row ${s.rev.row}).`
            : `Imported from ${s.file.name}; not listed in "${path.basename(opt.excel)}" — title and date read from the PDF.`,
          s.rev.note,
        ]
          .filter(Boolean)
          .join(" "),
      };
      const existingId = docIdByNumber.get(s.doc.number);
      if (existingId) {
        await addRevisionFromUpload({ documentId: existingId, uploadId: staged.uploadId, revision, publish: true, notify: false, publishedAt }, user);
      } else {
        const res = await createDocumentFromUpload(
          {
            uploadId: staged.uploadId,
            meta: {
              title: s.doc.title,
              documentNumber: s.doc.number,
              description: null,
              categoryId: s.categoryId,
              subcategoryId: null,
              productModels: productModels(s.doc.product),
              documentTypeId: typeId(s.doc.type),
              language: s.doc.language,
              source: "NSK HQ",
              visibility: "all_dealers",
              regionIds: [],
            },
            revision,
            publish: true,
            notify: false,
            publishedAt,
          },
          user,
        );
        docIdByNumber.set(s.doc.number, res.documentId);
      }
      done++;
      console.log(`  ✓ ${label}`);
    } catch (e) {
      failed.push(`${label}: ${e instanceof Error ? e.message : e}`);
      console.log(`  ✗ ${label} — ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nImported ${done} revision(s).${failed.length ? ` ${failed.length} failed:\n  ${failed.join("\n  ")}` : ""}`);
  // Keep a fingerprint of what was imported in the activity log.
  const { logActivity } = await import("@/server/services/activity");
  await logActivity({
    userId: user.id,
    action: "document.bulk_import",
    description: `Bulk import from "${path.basename(opt.excel)}" (sheet ${opt.sheet}): ${done} revision(s) imported${failed.length ? `, ${failed.length} failed` : ""}. Fingerprint ${createHash("sha256").update(steps.map((s) => s.file.name).join("|")).digest("hex").slice(0, 12)}.`,
  });
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
