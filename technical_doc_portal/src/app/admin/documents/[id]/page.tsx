import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Download, ExternalLink, Eye, FileStack, PenSquare, ScanText } from "lucide-react";
import { requirePermission, type SessionUser } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getAdminDocument, getCategoryTree, getDocumentTypes, getLanguages, getRegions } from "@/server/services/documents";
import { renderAuthoredHtml } from "@/server/services/authored-render";
import { can } from "@/lib/permissions";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { formatBytes, nextRevisionLabel } from "@/lib/text";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { Badge, DocLabelBadge, RevisionStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DefinitionList, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { MetadataForm } from "@/components/admin/metadata-form";
import { LifecycleButtons } from "@/components/admin/lifecycle-buttons";
import { OcrButton } from "@/components/admin/ocr-button";
import {
  EditRevisionButton,
  PublishRevisionButton,
  RejectRevisionButton,
  RestoreRevisionButton,
} from "@/components/admin/revision-actions";

const UUID = /^[0-9a-f-]{36}$/i;
const TABS = [
  ["overview", "Overview"],
  ["metadata", "Metadata"],
  ["revisions", "Revision history"],
  ["activity", "Activity"],
] as const;

export async function generateMetadata({ params }: PageProps<"/admin/documents/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  await requirePermission("documents.view_all");
  const doc = await getAdminDocument(id);
  return doc ? { title: `${doc.documentNumber} · Admin` } : {};
}

export default async function AdminDocumentPage({ params, searchParams }: PageProps<"/admin/documents/[id]">) {
  const user = await requirePermission("documents.view_all");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const doc = await getAdminDocument(id);
  if (!doc) notFound();
  const sp = await searchParams;
  const tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "overview") as (typeof TABS)[number][0];

  const perms = {
    edit: can(user.role, "documents.edit_metadata"),
    upload: can(user.role, "documents.upload"),
    publish: can(user.role, "documents.publish"),
    archive: can(user.role, "documents.archive"),
    restore: can(user.role, "revisions.restore"),
    correct: can(user.role, "revisions.correct"),
    author: can(user.role, "documents.author"),
  };
  const revisions = doc.revisions;
  const current = revisions.find((r) => r.approvalStatus === "published");
  const pending = revisions.find((r) => r.approvalStatus === "draft");
  const selectedRev =
    (typeof sp.rev === "string" && revisions.find((r) => r.id === sp.rev)) || pending || current || revisions[0];
  const latest = revisions[0];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/admin/documents", label: "Document management" }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {doc.title}
            <DocLabelBadge label={doc.label} className="text-[12px]" />
            {doc.kind === "authored" && <Badge tone="navy">Authored in portal</Badge>}
          </span>
        }
        description={
          <span className="font-mono text-[13px] text-navy">
            {doc.documentNumber} · {current ? `Current revision ${current.revisionNumber}` : "Not yet published"}
          </span>
        }
        actions={
          <>
            {doc.status === "published" && (
              <Button asChild variant="ghost">
                <Link href={`/portal/documents/${doc.id}`}>
                  <ExternalLink /> View as dealer
                </Link>
              </Button>
            )}
            <LifecycleButtons
              doc={doc}
              status={doc.status}
              hasCurrent={Boolean(current)}
              canPublish={perms.publish}
              canArchive={perms.archive}
            />
            {perms.upload && doc.kind === "uploaded_pdf" && (
              <Button asChild>
                <Link href={`/admin/upload?document=${doc.id}`} data-testid="upload-revision-link">
                  <FileStack /> Upload new revision
                </Link>
              </Button>
            )}
            {perms.author && doc.kind === "authored" && (
              <Button asChild>
                <Link href={`/admin/authored/${doc.id}`}>
                  <PenSquare /> Edit content
                </Link>
              </Button>
            )}
          </>
        }
      />

      {sp.created && (
        <Alert tone="success" className="mb-4">
          {sp.created === "published" ? "Document created and published to dealers (labelled NEW)." : "Document saved as a draft. Review it below, then publish."}
        </Alert>
      )}
      {sp.revision && (
        <Alert tone="success" className="mb-4">
          {sp.revision === "published"
            ? "New revision published. Dealers now see it as the current version (labelled UPDATED)."
            : "New revision saved as a draft. Dealers continue to see the previous approved revision until you publish it."}
        </Alert>
      )}
      {doc.status === "withdrawn" && (
        <Alert tone="danger" className="mb-4" title="Withdrawn">
          {doc.doc.statusReason ? `Reason: ${doc.doc.statusReason}` : "This document is no longer available to dealers."}
        </Alert>
      )}
      {pending && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber/30 bg-amber-50 px-4 py-3" data-testid="pending-banner">
          <div className="min-w-0 flex-1 text-sm text-[#6b3d05]">
            <p className="font-semibold">Revision {pending.revisionNumber} is awaiting review</p>
            <p>
              Uploaded {fmtDateTime(pending.uploadedAt)} by {pending.uploader?.fullName ?? "—"}.{" "}
              {current ? `Dealers still see ${current.revisionNumber}.` : "The document is not visible to dealers yet."}
            </p>
          </div>
          {selectedRev?.id !== pending.id && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/documents/${doc.id}?rev=${pending.id}`}>
                <Eye /> Preview draft
              </Link>
            </Button>
          )}
          {perms.publish && (
            <>
              <RejectRevisionButton revision={pending} size="sm" />
              <PublishRevisionButton revision={pending} isFirst={!doc.doc.firstPublishedAt} currentRevisionNumber={current?.revisionNumber} size="sm" />
            </>
          )}
        </div>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Document sections">
        {TABS.map(([t, label]) => (
          <Link
            key={t}
            href={`/admin/documents/${doc.id}${t === "overview" ? "" : `?tab=${t}`}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm",
              tab === t ? "border-navy font-medium text-navy" : "border-transparent text-muted hover:text-navy",
            )}
            aria-current={tab === t ? "page" : undefined}
          >
            {label}
            {t === "revisions" && <span className="ml-1.5 rounded bg-grey-50 px-1.5 text-[11px] tabular">{revisions.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview doc={doc} selectedRev={selectedRev} perms={perms} />}
      {tab === "metadata" && <MetadataTab doc={doc} canEdit={perms.edit} user={user} />}
      {tab === "revisions" && (
        <RevisionsTab doc={doc} perms={perms} compareId={typeof sp.compare === "string" ? sp.compare : undefined} latestNumber={latest?.revisionNumber} />
      )}
      {tab === "activity" && <ActivityTab documentId={doc.id} />}
    </div>
  );
}

type AdminDoc = NonNullable<Awaited<ReturnType<typeof getAdminDocument>>>;
type Rev = AdminDoc["revisions"][number];

async function Overview({ doc, selectedRev, perms }: { doc: AdminDoc; selectedRev?: Rev; perms: Record<string, boolean> }) {
  let authoredHtml: string | null = null;
  if (doc.kind === "authored" && selectedRev && !selectedRev.fileKey) {
    const [full] = await db
      .select({ c: schema.documentRevisions.authoredContent })
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, selectedRev.id));
    authoredHtml = renderAuthoredHtml(full?.c);
  }
  const fileUrl = selectedRev ? `/api/files/revisions/${selectedRev.id}` : "";
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        {selectedRev && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Showing revision</span>
            <span className="font-mono font-medium">{selectedRev.revisionNumber}</span>
            <RevisionStatusBadge status={selectedRev.approvalStatus} />
            {selectedRev.approvalStatus !== "published" && (
              <span className="text-[12px] text-muted">— not visible to dealers</span>
            )}
          </div>
        )}
        {selectedRev?.fileKey ? (
          <PdfViewer
            key={selectedRev.id}
            fileUrl={fileUrl}
            downloadUrl={`${fileUrl}?download=1`}
            title={`${doc.documentNumber} — ${doc.title}`}
            subtitle={`Revision ${selectedRev.revisionNumber}`}
          />
        ) : authoredHtml ? (
          <Card>
            <CardBody className="px-6 py-8 sm:px-10">
              <article className="doc-prose mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: authoredHtml }} />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <EmptyState title="No file for this revision" />
          </Card>
        )}
      </div>
      <aside className="space-y-4">
        <Card>
          <CardHeader title="Document" />
          <CardBody>
            <DefinitionList
              items={[
                ["Number", <span key="n" className="font-mono">{doc.documentNumber}</span>],
                ["Status", <DocLabelBadge key="s" label={doc.label} />],
                ["Category", doc.subcategoryName ? `${doc.categoryName} › ${doc.subcategoryName}` : doc.categoryName],
                ["Type", doc.documentType],
                ["Language", doc.language],
                ["Source", doc.doc.source],
                ["Products", doc.productModels.join(", ") || "—"],
                ["Dealer access", doc.doc.visibility === "all_dealers" ? "All dealers" : doc.regions.map((r) => r.name).join(", ")],
                ["First published", fmtDate(doc.firstPublishedAt)],
                ["Last updated", fmtDate(doc.lastPublishedAt)],
                ["Created", fmtDate(doc.doc.createdAt)],
              ]}
            />
          </CardBody>
        </Card>
        {selectedRev && (
          <Card>
            <CardHeader title={`Revision ${selectedRev.revisionNumber}`} />
            <CardBody className="space-y-3">
              <DefinitionList
                items={[
                  ["Release date", fmtDate(selectedRev.releaseDate)],
                  ["Uploaded", `${fmtDateTime(selectedRev.uploadedAt)}`],
                  ["Uploaded by", selectedRev.uploader?.fullName ?? "—"],
                  ["Published", selectedRev.publishedAt ? `${fmtDateTime(selectedRev.publishedAt)} by ${selectedRev.approver?.fullName ?? "—"}` : "—"],
                  ["File", selectedRev.originalFilename ?? "—"],
                  ["Size", formatBytes(selectedRev.fileSize)],
                  ["Pages", selectedRev.pageCount ?? "—"],
                  [
                    "Search text",
                    selectedRev.textSource === "pdf"
                      ? "Extracted from PDF"
                      : selectedRev.textSource === "ocr"
                        ? "From OCR"
                        : selectedRev.textSource === "authored"
                          ? "From authored content"
                          : "None",
                  ],
                  ["SHA-256", <span key="h" className="break-all font-mono text-[11px] text-muted">{selectedRev.sha256 ?? "—"}</span>],
                ]}
              />
              {selectedRev.fileKey && perms.edit && (selectedRev.ocrStatus !== "not_needed" || selectedRev.textSource === "none") && (
                <OcrButton revisionId={selectedRev.id} status={selectedRev.ocrStatus} />
              )}
              {selectedRev.fileKey && perms.edit && selectedRev.ocrStatus === "not_needed" && selectedRev.textSource === "pdf" && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  <ScanText className="size-3.5" /> Text layer found — OCR not needed.
                </p>
              )}
              {selectedRev.fileKey && (
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <a href={`/api/files/revisions/${selectedRev.id}?download=1`}>
                    <Download /> Download original
                  </a>
                </Button>
              )}
            </CardBody>
          </Card>
        )}
        {doc.description && (
          <Card>
            <CardHeader title="Description" />
            <CardBody className="text-sm text-muted">{doc.description}</CardBody>
          </Card>
        )}
      </aside>
    </div>
  );
}

async function MetadataTab({ doc, canEdit, user }: { doc: AdminDoc; canEdit: boolean; user: SessionUser }) {
  const [tree, types, regions, languages] = await Promise.all([
    getCategoryTree({ includeInactive: true }),
    getDocumentTypes({ includeInactive: true }),
    getRegions(),
    getLanguages(user, "admin"),
  ]);
  return (
    <Card className="max-w-4xl">
      <CardHeader title="Document metadata" description="Edit how the document is catalogued. The PDF is not changed." />
      <CardBody>
        <MetadataForm
          documentId={doc.id}
          canEdit={canEdit}
          options={{
            categories: tree.map((c) => ({ id: c.id, name: c.name, status: c.status, children: c.children.map((s) => ({ id: s.id, name: s.name, status: s.status })) })),
            types: types.map((t) => ({ id: t.id, name: t.name })),
            regions: regions.map((r) => ({ id: r.id, name: r.name })),
            languages,
          }}
          defaults={{
            title: doc.title,
            documentNumber: doc.documentNumber,
            description: doc.description,
            categoryId: doc.categoryId,
            subcategoryId: doc.doc.subcategoryId,
            productModels: doc.productModels,
            documentTypeId: doc.doc.documentTypeId,
            language: doc.language,
            source: doc.doc.source,
            visibility: doc.doc.visibility,
            regionIds: doc.regions.map((r) => r.id),
          }}
        />
      </CardBody>
    </Card>
  );
}

function RevisionsTab({
  doc,
  perms,
  compareId,
  latestNumber,
}: {
  doc: AdminDoc;
  perms: Record<string, boolean>;
  compareId?: string;
  latestNumber?: string;
}) {
  const revisions = doc.revisions;
  const current = revisions.find((r) => r.approvalStatus === "published");
  const compare = compareId ? revisions.find((r) => r.id === compareId) : undefined;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Revision history"
          description="Every revision is kept with its original file. Only the current revision is visible to dealers."
        />
        <Table>
          <THead>
            <tr>
              <TH>Revision</TH>
              <TH>Release date</TH>
              <TH>Uploaded</TH>
              <TH>Published</TH>
              <TH>Status</TH>
              <TH>Notes</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {revisions.map((r) => (
              <TR key={r.id} className={cn(r.approvalStatus === "published" && "bg-green-50/40")} data-testid="revision-row">
                <TD className="font-mono font-medium">{r.revisionNumber}</TD>
                <TD className="tabular whitespace-nowrap">{fmtDate(r.releaseDate)}</TD>
                <TD className="text-[13px] whitespace-nowrap">
                  <span className="tabular">{fmtDate(r.uploadedAt)}</span>
                  <span className="block text-[12px] text-muted">{r.uploader?.fullName ?? "—"}</span>
                </TD>
                <TD className="text-[13px] whitespace-nowrap">
                  <span className="tabular">{fmtDate(r.publishedAt)}</span>
                  {r.approver && <span className="block text-[12px] text-muted">{r.approver.fullName}</span>}
                </TD>
                <TD>
                  <RevisionStatusBadge status={r.approvalStatus} />
                  {r.restoredFromId && <span className="mt-1 block text-[11px] text-muted">Restored copy</span>}
                </TD>
                <TD className="max-w-64 text-[13px] text-muted">
                  <span className="line-clamp-3 whitespace-pre-line">{r.revisionNotes ?? "—"}</span>
                </TD>
                <TD>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/documents/${doc.id}?rev=${r.id}`}>
                        <Eye /> View
                      </Link>
                    </Button>
                    {r.fileKey && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/api/files/revisions/${r.id}?download=1`} aria-label={`Download ${r.revisionNumber}`}>
                          <Download />
                        </a>
                      </Button>
                    )}
                    {current && r.id !== current.id && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/documents/${doc.id}?tab=revisions&compare=${r.id}`}>Compare</Link>
                      </Button>
                    )}
                    {r.approvalStatus === "draft" && perms.edit && <EditRevisionButton revision={r} />}
                    {r.approvalStatus !== "draft" && perms.edit && !perms.correct && <EditRevisionButton revision={r} />}
                    {r.publishedAt && perms.correct && <EditRevisionButton revision={r} correction />}
                    {(r.approvalStatus === "superseded" || r.approvalStatus === "rejected") && perms.restore && !revisions.some((x) => x.approvalStatus === "draft") && (
                      <RestoreRevisionButton revision={r} suggestedNumber={nextRevisionLabel(latestNumber)} />
                    )}
                    {r.approvalStatus === "draft" && perms.publish && (
                      <>
                        <RejectRevisionButton revision={r} size="sm" />
                        <PublishRevisionButton revision={r} isFirst={!doc.doc.firstPublishedAt} currentRevisionNumber={current?.revisionNumber} size="sm" />
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      {compare && current && (
        <Card>
          <CardHeader
            title={`Compare ${compare.revisionNumber} with current ${current.revisionNumber}`}
            action={
              <Link href={`/admin/documents/${doc.id}?tab=revisions`} className="text-sm text-blue hover:underline">
                Close
              </Link>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH></TH>
                <TH>{compare.revisionNumber}</TH>
                <TH>{current.revisionNumber} (current)</TH>
              </tr>
            </THead>
            <tbody>
              {(
                [
                  ["Status", <RevisionStatusBadge key="a" status={compare.approvalStatus} />, <RevisionStatusBadge key="b" status={current.approvalStatus} />],
                  ["Release date", fmtDate(compare.releaseDate), fmtDate(current.releaseDate)],
                  ["Uploaded", `${fmtDateTime(compare.uploadedAt)} · ${compare.uploader?.fullName ?? "—"}`, `${fmtDateTime(current.uploadedAt)} · ${current.uploader?.fullName ?? "—"}`],
                  ["Published", fmtDateTime(compare.publishedAt), fmtDateTime(current.publishedAt)],
                  ["Pages", compare.pageCount ?? "—", current.pageCount ?? "—"],
                  ["File", `${compare.originalFilename ?? "—"} (${formatBytes(compare.fileSize)})`, `${current.originalFilename ?? "—"} (${formatBytes(current.fileSize)})`],
                  ["Identical file", compare.sha256 && compare.sha256 === current.sha256 ? "Yes — same SHA-256" : "No", ""],
                  ["Notes", compare.revisionNotes ?? "—", current.revisionNotes ?? "—"],
                ] as [string, React.ReactNode, React.ReactNode][]
              ).map(([k, a, b]) => (
                <TR key={k}>
                  <TD className="w-40 text-muted">{k}</TD>
                  <TD className="whitespace-pre-line text-[13px]">{a}</TD>
                  <TD className="whitespace-pre-line text-[13px]">{b}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <CardBody className="flex flex-wrap gap-2 border-t border-border">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/documents/${doc.id}?rev=${compare.id}`}>Open {compare.revisionNumber}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/documents/${doc.id}?rev=${current.id}`}>Open {current.revisionNumber}</Link>
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function ActivityTab({ documentId }: { documentId: string }) {
  const rows = await db
    .select({ log: schema.activityLogs, user: schema.users.fullName })
    .from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
    .where(eq(schema.activityLogs.documentId, documentId))
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(200);
  return (
    <Card>
      <CardHeader title="Document activity" description="Every administrative action on this document." />
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map(({ log, user }) => (
            <li key={log.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="w-40 shrink-0 tabular text-[13px] text-muted">{fmtDateTime(log.createdAt)}</span>
              <span className="min-w-0 flex-1">{log.description}</span>
              <span className="text-[13px] text-muted">{user ?? "System"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No activity recorded" />
      )}
    </Card>
  );
}
