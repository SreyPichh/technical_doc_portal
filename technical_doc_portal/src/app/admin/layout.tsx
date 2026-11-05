import Link from "next/link";
import { FileText, FolderTree, History, LayoutDashboard, ScrollText, Settings, Upload, Users } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { ROLE_LABELS } from "@/lib/permissions";
import { Brand } from "@/components/shell/brand";
import { NavLink } from "@/components/shell/nav-link";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/documents", label: "Document Management", icon: FileText },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/upload", label: "Upload Documents", icon: Upload },
  { href: "/admin/revisions", label: "Revision History", icon: History },
  { href: "/admin/dealers", label: "Dealer Management", icon: Users },
  { href: "/admin/activity", label: "Activity Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermission("admin.access");
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-navy text-white lg:flex">
        <Link href="/admin" className="block border-b border-white/10 px-5 py-5">
          <Brand area="Administration" />
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Admin">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <NavLink
              key={href}
              href={href}
              exact={exact}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/75 hover:bg-white/8 hover:text-white"
              activeClassName="!bg-white/12 !text-white font-medium shadow-[inset_3px_0_0_var(--red)]"
            >
              <Icon className="size-4 opacity-80" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[11px] text-white/45">
          Signed in as {ROLE_LABELS[user.role]}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <MobileNav items={NAV.map(({ href, label, exact }) => ({ href, label, exact }))} title="NSK Administration" tone="light" />
          <span className="text-sm font-semibold text-navy lg:hidden">NSK Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/portal" className="hidden rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-grey-50 hover:text-navy sm:block">
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
        <main className="w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
