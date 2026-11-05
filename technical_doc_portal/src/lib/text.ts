/**
 * Normalises text for indexing and searching:
 *  - NFKC folds full-width characters (e.g. "ＴＥＣ－２６－０５６") to ASCII,
 *  - "Z - SG45L" style spaced hyphens are tightened to "Z-SG45L",
 *  - runs of whitespace are collapsed (newlines kept).
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[‐-―−－]/g, "-")
    .replace(/([A-Za-z0-9])\s+-\s+(?=[A-Za-z0-9])/g, "$1-")
    .replace(/[ \t 　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeQuery(q: string): string {
  return normalizeText(q).replace(/\s+/g, " ").slice(0, 200);
}

export function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "category"
  );
}

export function formatBytes(n: number | null | undefined) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Suggests the next revision label: R1 → R2, Rev. 02 → Rev. 03, 3 → 4. */
export function nextRevisionLabel(current?: string | null) {
  if (!current) return "R0";
  const m = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${current}-1`;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${n}${m[3]}`;
}
