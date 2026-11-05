import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity logs" };

const GROUPS: Record<string, string> = {
  document: "Documents",
  revision: "Revisions",
  category: "Categories",
  user: "Accounts",
  auth: "Sign-in",
  settings: "Settings",
  notification: "Notifications",
  document_type: "Document types",
  region: "Regions",
};

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requirePermission("activity.view");
  const sp = await searchParams;
  const group = typeof sp.group === "string" && sp.group in GROUPS ? sp.group : undefined;
  const userId = typeof sp.user === "string" && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const a = schema.activityLogs;
  const where: SQL[] = [];
  if (group) where.push(like(a.action, `${group}.%`));
  if (userId) where.push(eq(a.userId, userId));
  if (q) where.push(sql`${a.description} ilike ${`%${q}%`}`);
  if (from) where.push(gte(a.createdAt, new Date(`${from}T00:00:00`)));
  if (to) where.push(lte(a.createdAt, new Date(`${to}T23:59:59`)));
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }], staff] = await Promise.all([
    db
      .select({ log: a, user: schema.users.fullName, number: schema.documents.documentNumber })
      .from(a)
      .leftJoin(schema.users, eq(schema.users.id, a.userId))
      .leftJoin(schema.documents, eq(schema.documents.id, a.documentId))
      .where(cond)
      .orderBy(desc(a.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(a).where(cond),
    db
      .selectDistinct({ id: schema.users.id, name: schema.users.fullName })
      .from(schema.users)
      .innerJoin(a, eq(a.userId, schema.users.id))
      .orderBy(schema.users.fullName),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ group, user: userId, q: q || undefined, from, to, page: String(p) })) if (v) u.set(k, v);
    return `/admin/activity?${u}`;
  };
  return (
    <div>
      <PageHeader title="Activity logs" description="Append-only audit trail of administrative operations. Entries cannot be edited or deleted." />
      <form className="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6" action="/admin/activity">
        <Input name="q" defaultValue={q} placeholder="Search descriptions" className="lg:col-span-2" />
        <Select name="group" defaultValue={group ?? ""}>
          <option value="">All areas</option>
          {Object.entries(GROUPS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="user" defaultValue={userId ?? ""}>
          <option value="">All users</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label="From" />
        <div className="flex gap-2">
          <Input type="date" name="to" defaultValue={to} aria-label="To" />
          <Button type="submit">Filter</Button>
        </div>
      </form>
      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Details</TH>
                <TH>IP</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ log, user, number }) => (
                <TR key={log.id}>
                  <TD className="tabular text-[13px] whitespace-nowrap text-muted">{fmtDateTime(log.createdAt)}</TD>
                  <TD className="text-[13px] whitespace-nowrap">{user ?? "System"}</TD>
                  <TD>
                    <Badge tone="navy">{log.action}</Badge>
                  </TD>
                  <TD className="text-[13px]">
                    {log.description}
                    {log.documentId && number && (
                      <Link href={`/admin/documents/${log.documentId}?tab=activity`} className="ml-2 font-mono text-[12px] text-blue hover:underline">
                        {number}
                      </Link>
                    )}
                  </TD>
                  <TD className="font-mono text-[12px] text-muted">{log.ip ?? "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No activity matches these filters" />
        )}
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={qs} />
    </div>
  );
}
