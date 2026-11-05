"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  LoaderCircle,
  Maximize,
  Minimize,
  MoveHorizontal,
  Scan,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeQuery, normalizeText } from "@/lib/text";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const GAP = 16;
const PAD = 16;

type FitMode = "width" | "page" | null;

export type PdfViewerProps = {
  /** Authenticated URL of the PDF (served by /api/files/... — never a storage URL). */
  fileUrl: string;
  downloadUrl?: string;
  title?: string;
  subtitle?: string;
  initialQuery?: string;
  className?: string;
  /** Height of the viewer when not full-screen. */
  height?: string;
};

type PageState = {
  width: number; // at scale 1
  height: number;
};

export function PdfViewer({
  fileUrl,
  downloadUrl,
  title,
  subtitle,
  initialQuery,
  className,
  height = "min(85vh, 1100px)",
}: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pdfjsRef = useRef<PdfJs | null>(null);
  const pageCache = useRef<Map<number, PDFPageProxy>>(new Map());
  const renderState = useRef<Map<number, { scale: number; task?: RenderTask; text?: { cancel(): void } }>>(new Map());
  const pageTexts = useRef<string[] | null>(null);
  /** Page whose first highlighted match should be scrolled into view once rendered. */
  const pendingHitPage = useRef<number | null>(null);
  const queryRef = useRef("");
  const findSeq = useRef(0);
  const initialFindDone = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState<FitMode>("width");
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [fullscreen, setFullscreen] = useState(false);
  const [visible, setVisible] = useState<Set<number>>(new Set([1, 2]));
  const [findOpen, setFindOpen] = useState(Boolean(initialQuery));
  const [query, setQuery] = useState(initialQuery ?? "");
  const [hits, setHits] = useState<number[]>([]); // pages containing the query
  const [hitIndex, setHitIndex] = useState(0);
  const [activeQuery, setActiveQuery] = useState("");

  /* ---------------- Load document ---------------- */
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        pdfjsRef.current = pdfjs;
        task = pdfjs.getDocument({
          url: fileUrl,
          withCredentials: true,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/",
          enableXfa: false,
        });
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        const sizes: PageState[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          pageCache.current.set(i, p);
          const vp = p.getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setPages(sizes);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        const msg = (e as { status?: number; name?: string })?.status;
        setError(
          msg === 401 || msg === 403
            ? "Your session has expired. Please sign in again."
            : msg === 404
              ? "This document is not available to your account."
              : "The document could not be displayed. You can still download the original PDF.",
        );
        setStatus("error");
      }
    })();
    const states = renderState.current;
    const cache = pageCache.current;
    return () => {
      cancelled = true;
      for (const s of states.values()) {
        s.task?.cancel();
        s.text?.cancel();
      }
      states.clear();
      cache.clear();
      task?.destroy();
      docRef.current?.destroy();
      docRef.current = null;
      pageTexts.current = null;
    };
  }, [fileUrl]);

  /* ---------------- Fit modes ---------------- */
  const computeFit = useCallback(
    (mode: Exclude<FitMode, null>) => {
      const el = scrollRef.current;
      if (!el || !pages.length) return 1;
      const maxW = Math.max(...pages.map((p) => p.width));
      const maxH = Math.max(...pages.map((p) => p.height));
      const availW = el.clientWidth - PAD * 2;
      const availH = el.clientHeight - PAD * 2;
      const byWidth = availW / maxW;
      const s = mode === "width" ? byWidth : Math.min(byWidth, availH / maxH);
      return Math.max(0.25, Math.min(s, mode === "width" ? 2 : 4));
    },
    [pages],
  );

  useEffect(() => {
    if (!fit || status !== "ready") return;
    const apply = () => setScale(computeFit(fit));
    apply();
    const ro = new ResizeObserver(apply);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [fit, status, computeFit, fullscreen]);

  const zoom = (dir: 1 | -1) => {
    setFit(null);
    setScale((s) => {
      const next = dir > 0 ? ZOOM_STEPS.find((z) => z > s + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < s - 0.001);
      return next ?? s;
    });
  };

  /* ---------------- Visibility tracking ---------------- */
  useEffect(() => {
    if (status !== "ready") return;
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root, rootMargin: "600px 0px" },
    );
    pageEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [status, pages.length]);

  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const mid = root.scrollTop + root.clientHeight * 0.35;
    let page = 1;
    for (let i = 0; i < pageEls.current.length; i++) {
      const el = pageEls.current[i];
      if (el && el.offsetTop <= mid) page = i + 1;
    }
    setCurrent(page);
    setPageInput(String(page));
  }, []);

  // Keep the reader on the same page when the zoom level changes.
  const currentRef = useRef(1);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    if (status !== "ready") return;
    const target = pendingHitPage.current ?? currentRef.current;
    const el = pageEls.current[target - 1];
    const root = scrollRef.current;
    if (el && root && target > 1) root.scrollTo({ top: el.offsetTop - PAD });
  }, [scale, status]);

  const goTo = useCallback((n: number) => {
    const el = pageEls.current[n - 1];
    const root = scrollRef.current;
    if (el && root) root.scrollTo({ top: el.offsetTop - PAD, behavior: "auto" });
  }, []);

  /* ---------------- Rendering ---------------- */
  const highlight = useCallback((pageNo: number) => {
    const el = pageEls.current[pageNo - 1];
    const layer = el?.querySelector<HTMLDivElement>(".textLayer");
    if (!layer) return;
    layer.querySelectorAll("mark.pdf-hit").forEach((m) => {
      const parent = m.parentElement!;
      parent.textContent = parent.textContent ?? "";
    });
    const q = queryRef.current;
    if (!q) return;
    const spans = Array.from(layer.querySelectorAll<HTMLSpanElement>("span:not(.markedContent)"));
    for (const span of spans) {
      const text = span.textContent ?? "";
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        span.textContent = "";
        span.append(text.slice(0, idx));
        const mark = document.createElement("mark");
        mark.className = "pdf-hit";
        mark.textContent = text.slice(idx, idx + q.length);
        span.append(mark, text.slice(idx + q.length));
      } else if (normalizeText(text).toLowerCase().includes(q)) {
        span.textContent = "";
        const mark = document.createElement("mark");
        mark.className = "pdf-hit";
        mark.textContent = text;
        span.append(mark);
      }
    }
    if (pendingHitPage.current === pageNo) {
      const first = layer.querySelector<HTMLElement>("mark.pdf-hit");
      const root = scrollRef.current;
      if (first && root && el) {
        pendingHitPage.current = null;
        layer.querySelectorAll("mark.pdf-hit.active").forEach((m) => m.classList.remove("active"));
        first.classList.add("active");
        const top = el.offsetTop + first.getBoundingClientRect().top - el.getBoundingClientRect().top;
        root.scrollTo({ top: Math.max(0, top - root.clientHeight / 3) });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-create when the query changes so highlights refresh
  }, [activeQuery]);

  useEffect(() => {
    if (status !== "ready" || !pdfjsRef.current) return;
    const pdfjs = pdfjsRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const n of visible) {
      const page = pageCache.current.get(n);
      const host = pageEls.current[n - 1];
      if (!page || !host) continue;
      const st = renderState.current.get(n);
      if (st && st.scale === scale) continue;
      st?.task?.cancel();
      st?.text?.cancel();
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.setAttribute("aria-hidden", "true");
      const task = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      const textDiv = document.createElement("div");
      textDiv.className = "textLayer";
      const textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      });
      renderState.current.set(n, { scale, task, text: textLayer });
      task.promise
        .then(async () => {
          await textLayer.render().catch(() => {});
          if (renderState.current.get(n)?.task !== task) return;
          host.querySelectorAll("canvas, .textLayer").forEach((x) => x.remove());
          host.append(canvas, textDiv);
          highlight(n);
        })
        .catch(() => {
          /* cancelled */
        });
    }
  }, [visible, scale, status, highlight]);

  /* ---------------- Find in document ---------------- */
  const ensureTexts = useCallback(async () => {
    if (pageTexts.current) return pageTexts.current;
    const doc = docRef.current;
    if (!doc) return [];
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = pageCache.current.get(i) ?? (await doc.getPage(i));
      const tc = await p.getTextContent();
      out.push(normalizeText(tc.items.map((it) => ("str" in it ? it.str : "")).join(" ")).toLowerCase());
    }
    pageTexts.current = out;
    return out;
  }, []);

  const runFind = useCallback(
    async (raw: string) => {
      const q = normalizeQuery(raw).toLowerCase();
      queryRef.current = q;
      setActiveQuery(q);
      if (!q) {
        findSeq.current++;
        setHits([]);
        return;
      }
      const seq = ++findSeq.current;
      const texts = await ensureTexts();
      if (seq !== findSeq.current) return; // a newer search has started
      const found = texts.flatMap((t, i) => (t.includes(q) || t.replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ? [i + 1] : []));
      setHits(found);
      setHitIndex(0);
      pendingHitPage.current = found.length ? found[0] : null;
      if (found.length) goTo(found[0]);
      // Re-apply highlights on every page that is already rendered.
      setTimeout(() => {
        for (const n of renderState.current.keys()) highlight(n);
      }, 0);
    },
    [ensureTexts, goTo, highlight],
  );

  useEffect(() => {
    // Run the search the dealer arrived with exactly once per document.
    if (status !== "ready" || !initialQuery || initialFindDone.current) return;
    initialFindDone.current = true;
    const t = setTimeout(() => void runFind(initialQuery), 0);
    return () => clearTimeout(t);
  }, [status, initialQuery, runFind]);

  useEffect(() => {
    // Re-apply highlights to already-rendered pages when the query changes.
    for (const n of renderState.current.keys()) highlight(n);
  }, [highlight]);

  const stepHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const i = (hitIndex + dir + hits.length) % hits.length;
    setHitIndex(i);
    pendingHitPage.current = hits[i];
    goTo(hits[i]);
    if (renderState.current.has(hits[i])) setTimeout(() => highlight(hits[i]), 0);
  };

  /* ---------------- Full screen ---------------- */
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!fullscreen) {
      setFullscreen(true);
      try {
        await el?.requestFullscreen?.();
      } catch {
        /* CSS full-screen fallback (e.g. iPhone Safari) */
      }
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const total = pages.length;
  const pct = Math.round(scale * 100);
  const placeholders = useMemo(
    () => pages.map((p) => ({ w: Math.floor(p.width * scale), h: Math.floor(p.height * scale) })),
    [pages, scale],
  );

  const btn =
    "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] text-foreground hover:bg-grey-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer sm:h-8 sm:min-w-8 [&_svg]:size-4";

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-surface",
        fullscreen && "fixed inset-0 z-[60] rounded-none border-0",
        className,
      )}
      style={fullscreen ? undefined : { height }}
      data-testid="pdf-viewer"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        {title && (
          <div className={cn("mr-2 min-w-0 max-w-[28rem] flex-col leading-tight", fullscreen ? "flex" : "hidden")}>
            <span className="truncate text-[13px] font-semibold">{title}</span>
            {subtitle && <span className="truncate text-[11px] text-muted">{subtitle}</span>}
          </div>
        )}
        <div className="flex items-center gap-0.5">
          <button className={btn} onClick={() => goTo(Math.max(1, current - 1))} disabled={current <= 1} aria-label="Previous page" title="Previous page">
            <ChevronLeft />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.min(total, Math.max(1, Number(pageInput) || 1));
              goTo(n);
            }}
            className="flex items-center gap-1 text-[13px] text-muted"
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-11 rounded border border-border-strong text-center text-foreground tabular sm:h-7 sm:w-10"
              aria-label="Page number"
              inputMode="numeric"
            />
            <span className="tabular" data-testid="page-count">/ {total || "–"}</span>
          </form>
          <button className={btn} onClick={() => goTo(Math.min(total, current + 1))} disabled={current >= total} aria-label="Next page" title="Next page">
            <ChevronRight />
          </button>
        </div>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <div className="flex items-center gap-0.5">
          <button className={btn} onClick={() => zoom(-1)} aria-label="Zoom out" title="Zoom out" disabled={scale <= ZOOM_STEPS[0]}>
            <ZoomOut />
          </button>
          <span className="w-12 text-center text-[13px] tabular text-muted" data-testid="zoom-level">
            {pct}%
          </span>
          <button className={btn} onClick={() => zoom(1)} aria-label="Zoom in" title="Zoom in" disabled={scale >= ZOOM_STEPS.at(-1)!}>
            <ZoomIn />
          </button>
          <button
            className={cn(btn, fit === "width" && "bg-navy-50 text-navy")}
            onClick={() => setFit("width")}
            aria-pressed={fit === "width"}
            aria-label="Fit to width"
            title="Fit to width"
          >
            <MoveHorizontal />
            <span className="hidden sm:inline">Width</span>
          </button>
          <button
            className={cn(btn, fit === "page" && "bg-navy-50 text-navy")}
            onClick={() => setFit("page")}
            aria-pressed={fit === "page"}
            aria-label="Fit to page"
            title="Fit to page"
          >
            <Scan />
            <span className="hidden sm:inline">Page</span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <button className={cn(btn, findOpen && "bg-navy-50 text-navy")} onClick={() => setFindOpen((v) => !v)} aria-label="Find in document" title="Find in document">
            <Search />
          </button>
          {downloadUrl && (
            <a className={btn} href={downloadUrl} title="Download original PDF" aria-label="Download original PDF" data-testid="viewer-download">
              <Download />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}
          <button className={btn} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}>
            {fullscreen ? <Minimize /> : <Maximize />}
          </button>
        </div>
        {findOpen && (
          <form
            className="flex w-full items-center gap-1 border-t border-border pt-1.5 mt-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              const value = (e.currentTarget.elements.namedItem("find") as HTMLInputElement | null)?.value ?? query;
              setQuery(value);
              void runFind(value);
            }}
          >
            <Search className="ml-1 size-4 text-subtle" />
            <input
              name="find"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find text in this document (model, order code…)"
              className="h-8 min-w-0 flex-1 rounded border border-border-strong px-2 text-[13px]"
              aria-label="Find in document"
              autoFocus={!initialQuery}
            />
            <span className="px-1 text-[12px] text-muted tabular whitespace-nowrap" aria-live="polite">
              {activeQuery
                ? hits.length
                  ? `Page ${hits[hitIndex]} · ${hitIndex + 1}/${hits.length} page${hits.length > 1 ? "s" : ""}`
                  : "No matches"
                : ""}
            </span>
            <button type="button" className={btn} onClick={() => stepHit(-1)} disabled={!hits.length} aria-label="Previous match">
              <ChevronUp />
            </button>
            <button type="button" className={btn} onClick={() => stepHit(1)} disabled={!hits.length} aria-label="Next match">
              <ChevronDown />
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                setFindOpen(false);
                setQuery("");
                void runFind("");
              }}
              aria-label="Close find"
            >
              <X />
            </button>
          </form>
        )}
      </div>

      {/* Pages */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-auto bg-[#e7eaf0]" style={{ padding: PAD }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-5 animate-spin" /> Loading document…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
            <p>{error}</p>
            {downloadUrl && (
              <a href={downloadUrl} className="font-medium text-blue hover:underline">
                Download the original PDF
              </a>
            )}
          </div>
        )}
        {status === "ready" && (
          <div className="flex w-max min-w-full flex-col items-center" style={{ gap: GAP }}>
            {placeholders.map((p, i) => (
              <div
                key={i}
                ref={(el) => {
                  pageEls.current[i] = el;
                }}
                data-page={i + 1}
                className="pdf-page shrink-0"
                style={{ width: p.w, height: p.h, ["--total-scale-factor" as string]: scale }}
                aria-label={`Page ${i + 1} of ${total}`}
                role="region"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
