"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FilePlus2, FileStack, FileUp, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { addRevisionAction, createDocumentAction } from "@/server/actions/documents";
import { MetadataFields, RevisionFields, type MetadataOptions } from "@/components/admin/metadata-fields";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { cn, fmtDate } from "@/lib/utils";
import { formatBytes, nextRevisionLabel } from "@/lib/text";

type DocOption = {
  id: string;
  number: string;
  title: string;
  status: string;
  revisionNumber: string | null;
  latestRevision: string | null;
  releaseDate: string | null;
  pageCount: number | null;
  fileSize: number | null;
  filename: string | null;
  pending: boolean;
};

type UploadResult = {
  uploadId: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  textChars: number;
  likelyScanned: boolean;
  suggestions: { documentNumber?: string; revision?: string; language?: string; releaseDate?: string; title?: string };
  duplicates: { documentId: string; documentNumber: string; revisionNumber: string }[];
};

export function UploadWizard({
  initialMode,
  initialDocumentId,
  maxMb,
  canPublish,
  options,
  documents,
}: {
  initialMode: "new" | "revision";
  initialDocumentId?: string;
  maxMb: number;
  canPublish: boolean;
  options: MetadataOptions;
  documents: DocOption[];
}) {
  const [mode, setMode] = useState(initialMode);
  const [docId, setDocId] = useState(initialDocumentId ?? "");
  const [docFilter, setDocFilter] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "analysing" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [createState, createAction, creating] = useActionState(createDocumentAction, null);
  const [revState, revAction, revising] = useActionState(addRevisionAction, null);
  const state = mode === "new" ? createState : revState;
  const pending = creating || revising;

  const target = documents.find((d) => d.id === docId);
  const filteredDocs = useMemo(() => {
    const q = docFilter.trim().toLowerCase();
    return q ? documents.filter((d) => `${d.number} ${d.title}`.toLowerCase().includes(q)) : documents;
  }, [docFilter, documents]);
  const existingMatch =
    mode === "new" && result?.suggestions.documentNumber
      ? documents.find((d) => d.number.toLowerCase() === result.suggestions.documentNumber!.toLowerCase())
      : undefined;

  function reset() {
    xhrRef.current?.abort();
    setFile(null);
    setResult(null);
    setPhase("idle");
    setProgress(0);
    setUploadError(null);
  }

  function upload(f: File) {
    setUploadError(null);
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) {
      setUploadError("Only PDF files can be uploaded.");
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setUploadError(`The file is ${formatBytes(f.size)} — the limit is ${maxMb} MB.`);
      return;
    }
    if (f.size === 0) {
      setUploadError("The file is empty.");
      return;
    }
    setFile(f);
    setPhase("uploading");
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/admin/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => setPhase("analysing");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setResult(xhr.response as UploadResult);
        setPhase("done");
      } else {
        setUploadError((xhr.response as { error?: string } | null)?.error ?? `Upload failed (${xhr.status}).`);
        setPhase("error");
      }
    };
    xhr.onerror = () => {
      setUploadError("Network error — the upload did not complete.");
      setPhase("error");
    };
    const fd = new FormData();
    fd.append("file", f);
    xhr.send(fd);
  }

  const s = result?.suggestions ?? {};

  return (
    <div className="space-y-6">
      {/* Step 1 — choose */}
      <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Upload type">
        {(
          [
            ["new", FilePlus2, "Upload new document", "Creates a new document entry in the library."],
            ["revision", FileStack, "Upload new revision", "Adds a newer revision to an existing document. The previous revision is preserved."],
          ] as const
        ).map(([m, Icon, title, desc]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors cursor-pointer",
              mode === m ? "border-navy ring-2 ring-navy/15" : "border-border hover:border-navy-100",
            )}
            data-testid={`mode-${m}`}
          >
            <span className={cn("rounded-md p-2", mode === m ? "bg-navy text-white" : "bg-navy-50 text-navy")}>
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === "revision" && (
        <Card>
          <CardHeader title="Select the existing document" description="The document keeps its identity, history and links." />
          <CardBody className="space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="Filter by number or title" className="pl-9" />
            </label>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {filteredDocs.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-navy-50/50",
                    docId === d.id && "bg-navy-50",
                  )}
                >
                  <input type="radio" name="pickDoc" checked={docId === d.id} onChange={() => setDocId(d.id)} className="accent-navy" />
                  <span className="w-28 shrink-0 font-mono text-[12px] text-navy">{d.number}</span>
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  <span className="text-[12px] tabular text-muted">{d.revisionNumber ? `Current ${d.revisionNumber}` : "Not published"}</span>
                  {d.pending && <Badge tone="amber">Draft pending</Badge>}
                </label>
              ))}
              {!filteredDocs.length && <p className="px-3 py-6 text-center text-sm text-muted">No matching documents.</p>}
            </div>
            {target?.pending && (
              <Alert tone="warning">
                {target.number} already has a revision awaiting review. Publish or reject it first —{" "}
                <Link href={`/admin/documents/${target.id}`} className="font-medium underline">
                  open document
                </Link>
                .
              </Alert>
            )}
          </CardBody>
        </Card>
      )}

      {/* Step 2 — file */}
      <Card>
        <CardHeader title="PDF file" description={`PDF only, up to ${maxMb} MB. The original file is stored unchanged.`} />
        <CardBody>
          {phase === "idle" || phase === "error" ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                drag ? "border-navy bg-navy-50" : "border-border-strong bg-grey-50/50",
              )}
            >
              <FileUp className="size-8 text-navy" />
              <p className="mt-3 font-medium">Drag and drop the PDF here</p>
              <p className="mt-1 text-sm text-muted">or</p>
              <Button type="button" variant="secondary" className="mt-2" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                data-testid="file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
              {uploadError && (
                <Alert tone="danger" className="mt-4 w-full max-w-lg text-left">
                  {uploadError}
                </Alert>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {phase === "done" ? <CheckCircle2 className="size-5 text-green" /> : <LoaderCircle className="size-5 animate-spin text-navy" />}
                <span className="font-medium">{file?.name}</span>
                <span className="text-sm text-muted">{formatBytes(file?.size)}</span>
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={reset}>
                  <RotateCcw /> Choose another file
                </Button>
              </div>
              {phase !== "done" && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-grey-50" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-navy transition-all" style={{ width: `${phase === "analysing" ? 100 : progress}%` }} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {phase === "uploading" ? `Uploading… ${progress}%` : "Checking the PDF and extracting searchable text…"}
                  </p>
                </div>
              )}
              {result && (
                <div className="flex flex-wrap gap-2 text-[13px]" data-testid="upload-summary">
                  <Badge tone="navy">{result.pageCount} pages</Badge>
                  <Badge tone={result.textChars ? "green" : "amber"}>
                    {result.textChars ? `${result.textChars.toLocaleString()} characters of searchable text` : "No searchable text"}
                  </Badge>
                </div>
              )}
              {result?.likelyScanned && (
                <Alert tone="warning" title="This PDF looks scanned">
                  Little or no text could be extracted, so search will rely on the metadata. After saving, you can run OCR from the
                  document page to make its content searchable. The original PDF is always kept unchanged.
                </Alert>
              )}
              {result?.duplicates.length ? (
                <Alert tone="warning" title="Identical file already in the library">
                  This exact file is already stored as{" "}
                  {result.duplicates.map((d, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <Link href={`/admin/documents/${d.documentId}`} className="font-medium underline">
                        {d.documentNumber} {d.revisionNumber}
                      </Link>
                    </span>
                  ))}
                  . Check you have the right file before continuing.
                </Alert>
              ) : null}
              {existingMatch && (
                <Alert tone="info" title={`${existingMatch.number} already exists`}>
                  This looks like a new revision of an existing document.{" "}
                  <button
                    type="button"
                    className="font-medium underline cursor-pointer"
                    onClick={() => {
                      setMode("revision");
                      setDocId(existingMatch.id);
                    }}
                  >
                    Switch to “Upload new revision”
                  </button>
                </Alert>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Step 3 — details + preview */}
      {result && phase === "done" && (mode === "new" || target) && (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form action={mode === "new" ? createAction : revAction} className="space-y-6" key={`${mode}-${result.uploadId}-${docId}`}>
            <input type="hidden" name="uploadId" value={result.uploadId} />
            {mode === "revision" && <input type="hidden" name="documentId" value={docId} />}
            {mode === "new" ? (
              <Card>
                <CardHeader title="Document details" description="Suggested values were read from the first page — please check them." />
                <CardBody>
                  <MetadataFields
                    options={options}
                    defaults={{
                      title: s.title,
                      documentNumber: s.documentNumber,
                      language: s.language ?? "English",
                      source: "NSK HQ",
                      documentTypeId: options.types.find((t) => t.name === "Technical Information")?.id,
                    }}
                  />
                </CardBody>
              </Card>
            ) : (
              target && (
                <Card>
                  <CardHeader title="Compare revisions" description="Check the new file against the revision dealers currently see." />
                  <CardBody>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="revision-compare">
                        <thead>
                          <tr className="text-left text-[12px] uppercase tracking-wide text-muted">
                            <th className="py-1.5 pr-4 font-semibold"></th>
                            <th className="py-1.5 pr-4 font-semibold">Current (dealers see)</th>
                            <th className="py-1.5 font-semibold">New upload</th>
                          </tr>
                        </thead>
                        <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-1.5 [&_td]:pr-4">
                          <tr>
                            <td className="text-muted">Revision</td>
                            <td className="font-mono">{target.revisionNumber ?? "—"}</td>
                            <td className="font-mono">{s.revision ?? "—"} <span className="font-sans text-[12px] text-muted">(detected)</span></td>
                          </tr>
                          <tr>
                            <td className="text-muted">Release date</td>
                            <td>{fmtDate(target.releaseDate)}</td>
                            <td>{fmtDate(s.releaseDate ?? null)}</td>
                          </tr>
                          <tr>
                            <td className="text-muted">Pages</td>
                            <td>{target.pageCount ?? "—"}</td>
                            <td>{result.pageCount}</td>
                          </tr>
                          <tr>
                            <td className="text-muted">File</td>
                            <td className="break-all">{target.filename ?? "—"} · {formatBytes(target.fileSize)}</td>
                            <td className="break-all">{result.filename} · {formatBytes(result.fileSize)}</td>
                          </tr>
                          {s.documentNumber && s.documentNumber.toLowerCase() !== target.number.toLowerCase() && (
                            <tr>
                              <td colSpan={3} className="!pr-0">
                                <Alert tone="warning">
                                  The PDF mentions {s.documentNumber}, but you selected {target.number}. Make sure this is the right document.
                                </Alert>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
              )
            )}
            <Card>
              <CardHeader title="Revision" />
              <CardBody>
                <RevisionFields
                  defaults={{
                    revisionNumber:
                      mode === "revision"
                        ? s.revision && s.revision !== target?.latestRevision
                          ? s.revision
                          : nextRevisionLabel(target?.latestRevision)
                        : (s.revision ?? "R0"),
                    releaseDate: s.releaseDate,
                  }}
                  numberHint={mode === "revision" ? `Latest existing revision: ${target?.latestRevision ?? "—"}` : undefined}
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-4">
                {state?.error && <Alert tone="danger">{state.error}</Alert>}
                {canPublish && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox name="notify" defaultChecked className="mt-0.5" />
                    <span>
                      If published now, notify dealers by e-mail
                      <span className="block text-[12px] text-muted">Only when e-mail notifications are enabled in Settings.</span>
                    </span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending || (mode === "revision" && target?.pending)} data-testid="save-draft">
                    {pending && <LoaderCircle className="animate-spin" />}
                    Save as draft
                  </Button>
                  {canPublish && (
                    <Button type="submit" name="intent" value="publish" disabled={pending || (mode === "revision" && target?.pending)} data-testid="publish-now">
                      {pending && <LoaderCircle className="animate-spin" />}
                      {mode === "new" ? "Publish to dealers" : "Publish as current revision"}
                    </Button>
                  )}
                </div>
                <p className="text-[12px] text-muted">
                  {mode === "new"
                    ? "Drafts are visible only to administrators. Published documents appear to dealers with a NEW label."
                    : "A draft revision stays hidden — dealers keep seeing the current revision until you publish. Publishing marks the document UPDATED; the previous revision is kept in the history."}
                </p>
              </CardBody>
            </Card>
          </form>
          <div className="min-w-0 2xl:sticky 2xl:top-20 2xl:self-start">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber" /> Preview before publishing
            </p>
            <PdfViewer fileUrl={`/api/admin/uploads/${result.uploadId}/file`} title={result.filename} height="min(80vh, 1000px)" />
          </div>
        </div>
      )}
    </div>
  );
}
