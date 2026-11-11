import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Archive, CheckCircle2, FilePlus2, FileStack, FileText, FolderTree, RefreshCw, Sparkles, UserPlus, Users } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { adminStats, pendingRevisions } from "@/server/services/documents";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  const user = await requirePermission("admin.access");
  const sp = await searchParams;
  const [stats, pending, recentUploads, recentActivity, recentDealers] = await Promise.all([
    adminStats(),
    pendingRevisions(8),
    db
      .select({
        id: schema.documentRevisions.id,
        documentId: schema.documents.id,
        number: schema.documents.documentNumber,
        title: schema.documents.title,
        rev: schema.documentRevisions.revisionNumber,
        status: schema.documentRevisions.approvalStatus,
        at: schema.documentRevisions.uploadedAt,
        seq: schema.documentRevisions.sequence,
      })
      .from(schema.documentRevisions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentRevisions.documentId))
      .orderBy(desc(schema.documentRevisions.uploadedAt))
      .limit(8),
    can(user.role, "activity.view")
      ? db
          .select({ log: schema.activityLogs, user: schema.users.fullName })
          .from(schema.activityLogs)
          .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
          .orderBy(desc(schema.activityLogs.createdAt))
          .limit(8)
      : Promise.resolve([]),
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, "dealer"))
      .orderBy(desc(schema.users.createdAt))
      .limit(5),
  ]);

  const quick = [
    { href: "/admin/upload", label: "Upload new document", icon: FilePlus2, perm: "documents.upload" as const },
    { href: "/admin/upload?mode=revision", label: "Update existing document", icon: FileStack, perm: "documents.upload" as const },
    { href: "/admin/categories", label: "Manage categories", icon: FolderTree, perm: "categories.manage" as const },
    { href: "/admin/dealers", label: "Manage dealers", icon: UserPlus, perm: "dealers.manage" as const },
  ].filter((q) => can(user.role, q.perm));

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description={`Welcome back, ${user.fullName}.`} />
      {sp.pw === "1" && <Alert tone="success">Your password has been changed.</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total documents"
          value={stats.total}
          hint={stats.drafts ? `${stats.drafts} not yet published` : "All published or retired"}
          href="/admin/documents"
          icon={<FileText />}
        />
        <StatCard
          label="Published"
          value={stats.published}
          hint="Visible to dealers"
          href="/admin/documents?label=NEW&label=UPDATED&label=CURRENT"
          accent="green"
          icon={<CheckCircle2 />}
        />
        <StatCard label="New" value={stats.newDocs} hint="NEW label active" href="/admin/documents?label=NEW" accent="green" icon={<Sparkles />} />
        <StatCard label="Updated" value={stats.updatedDocs} hint="UPDATED label active" href="/admin/documents?label=UPDATED" accent="blue" icon={<RefreshCw />} />
        <StatCard
          label="Archived"
          value={stats.archived + stats.withdrawn}
          hint={`${stats.withdrawn} withdrawn`}
          href="/admin/documents?label=ARCHIVED&label=WITHDRAWN"
          accent="amber"
          icon={<Archive />}
        />
        <StatCard
          label="Dealer accounts"
          value={stats.dealers}
          hint={`${stats.activeDealers} active · ${stats.downloads30d} downloads (30 d)`}
          href="/admin/dealers"
          icon={<Users />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Awaiting approval"
            description="Draft documents and revisions that are not yet visible to dealers"
            action={stats.pendingRevisions ? <Badge tone="amber">{stats.pendingRevisions} pending</Badge> : null}
          />
          {pending.length ? (
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <li key={p.revisionId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="font-mono text-[12px] text-navy">{p.documentNumber}</span>
                  <Link href={`/admin/documents/${p.documentId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {p.title}
                  </Link>
                  <Badge tone={p.isFirst ? "navy" : "blue"}>{p.isFirst ? "New document" : `Revision ${p.revisionNumber}`}</Badge>
                  <span className="text-[12px] text-muted">
                    {fmtDate(p.uploadedAt)} · {p.uploader ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing awaiting approval" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid gap-2 p-4">
            {quick.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm font-medium hover:border-navy-100 hover:bg-navy-50">
                <span className="rounded bg-navy p-1.5 text-white">
                  <Icon className="size-4" />
                </span>
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recent uploads & revisions" action={<Link href="/admin/revisions" className="text-sm text-blue hover:underline">All</Link>} />
          <ul className="divide-y divide-border">
            {recentUploads.map((u) => (
              <li key={u.id} className="px-5 py-2.5 text-sm">
                <Link href={`/admin/documents/${u.documentId}`} className="font-medium hover:underline">
                  {u.number} <span className="font-mono">{u.rev}</span>
                </Link>
                <span className="block truncate text-[12px] text-muted">
                  {u.seq > 1 ? "Revision" : "New document"} · {u.status === "draft" ? "awaiting review" : u.status} · {fmtDate(u.at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={can(user.role, "activity.view") && <Link href="/admin/activity" className="text-sm text-blue hover:underline">All</Link>} />
          <ul className="divide-y divide-border">
            {recentActivity.map(({ log, user: who }) => (
              <li key={log.id} className="px-5 py-2.5 text-sm">
                <span className="line-clamp-2">{log.description}</span>
                <span className="block text-[12px] text-muted">
                  {who ?? "System"} · {fmtDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recently added dealers" action={<Link href="/admin/dealers" className="text-sm text-blue hover:underline">All</Link>} />
          <ul className="divide-y divide-border">
            {recentDealers.map((d) => (
              <li key={d.id} className="px-5 py-2.5 text-sm">
                <span className="font-medium">{d.fullName}</span>
                <span className="block truncate text-[12px] text-muted">
                  {d.dealerName ?? d.email} · {fmtDate(d.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
