import Link from "next/link";
import { cookies } from "next/headers";
import { requirePermission } from "@/server/auth/dal";
import { can, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { pendingApprovalCount } from "@/server/services/documents";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-nav";
import { SIDEBAR_COOKIE } from "@/lib/admin-sidebar";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermission("admin.access");
  const permissions = ROLE_PERMISSIONS[user.role];
  const [cookieStore, pendingApprovals] = await Promise.all([
    cookies(),
    can(user.role, "documents.view_all")
      ? pendingApprovalCount()
      : Promise.resolve(0),
  ]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <div className="flex min-h-dvh">
      <AdminSidebar
        permissions={permissions}
        userName={user.fullName}
        roleLabel={ROLE_LABELS[user.role]}
        pendingApprovals={pendingApprovals}
        initiallyCollapsed={collapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <AdminMobileNav permissions={permissions} />
          <span className="text-sm font-semibold text-navy lg:hidden">
            NSK Admin
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/portal"
              className="hidden rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-grey-50 hover:text-navy sm:block"
            >
              View dealer portal
            </Link>
            <UserMenu
              name={user.fullName}
              email={user.email}
              roleLabel={ROLE_LABELS[user.role]}
              isStaff
              area="admin"
              tone="light"
            />
          </div>
        </header>
        <main className="w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
