import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { getRegions } from "@/server/services/documents";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { DealerManager } from "./dealer-manager";

export const metadata: Metadata = { title: "Dealer management" };

export default async function DealersPage({ searchParams }: PageProps<"/admin/dealers">) {
  const user = await requirePermission("dealers.view");
  const sp = await searchParams;
  const staffView = sp.view === "staff" && can(user.role, "admins.manage");
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const u = schema.users;
  const where: SQL[] = [staffView ? ne(u.role, "dealer") : eq(u.role, "dealer")];
  if (q) where.push(sql`(${u.fullName} ilike ${`%${q}%`} or ${u.email} ilike ${`%${q}%`} or ${u.dealerName} ilike ${`%${q}%`})`);
  const [rows, regions] = await Promise.all([
    db
      .select({
        user: u,
        region: schema.regions.name,
        downloads: sql<number>`(select count(*)::int from ${schema.downloads} dl where dl.user_id = ${u.id})`,
      })
      .from(u)
      .leftJoin(schema.regions, eq(schema.regions.id, u.regionId))
      .where(and(...where))
      .orderBy(desc(u.createdAt)),
    getRegions(),
  ]);
  return (
    <div>
      <PageHeader
        title="Dealer management"
        description="Individual accounts for authorised dealers. New accounts receive a one-time temporary password and must set their own on first sign-in."
      />
      {can(user.role, "admins.manage") && (
        <div className="mb-4 flex gap-2">
          {[
            ["", "Dealers"],
            ["staff", "Staff accounts"],
          ].map(([v, label]) => (
            <Link
              key={v}
              href={v ? "/admin/dealers?view=staff" : "/admin/dealers"}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px]",
                (staffView ? "staff" : "") === v ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-navy-50",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      <DealerManager
        staffView={staffView}
        query={q}
        canManage={can(user.role, "dealers.manage")}
        canManageStaff={can(user.role, "admins.manage")}
        currentUserId={user.id}
        regions={regions.map((r) => ({ id: r.id, name: r.name }))}
        rows={rows.map((r) => ({
          id: r.user.id,
          fullName: r.user.fullName,
          email: r.user.email,
          dealerName: r.user.dealerName,
          regionId: r.user.regionId,
          region: r.region,
          role: r.user.role,
          status: r.user.status,
          mustChangePassword: r.user.mustChangePassword,
          lastLoginAt: r.user.lastLoginAt?.toISOString() ?? null,
          createdAt: r.user.createdAt.toISOString(),
          downloads: r.downloads,
        }))}
      />
    </div>
  );
}
