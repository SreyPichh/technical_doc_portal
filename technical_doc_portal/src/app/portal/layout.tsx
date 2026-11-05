import { Search } from "lucide-react";
import { requirePermission } from "@/server/auth/dal";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { Brand } from "@/components/shell/brand";
import { UserMenu } from "@/components/shell/user-menu";
import { NavLink } from "@/components/shell/nav-link";
import { MobileNav } from "@/components/shell/mobile-nav";
import Link from "next/link";

const NAV = [
  { href: "/portal", label: "Dashboard", exact: true },
  { href: "/portal/documents", label: "All Documents" },
  { href: "/portal/categories", label: "Product Categories" },
  { href: "/portal/updates", label: "Latest Updates" },
  { href: "/portal/saved", label: "Downloads / Saved" },
  { href: "/portal/account", label: "My Account" },
];

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requirePermission("portal.view");
  const staff = can(user.role, "admin.access");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <MobileNav items={NAV} title="NSK Technical Information" />
          <Link href="/portal" aria-label="Portal home">
            <Brand compact />
          </Link>
          <form action="/portal/documents" className="ml-auto hidden w-full max-w-sm md:block" role="search">
            <label className="relative block">
              <span className="sr-only">Search documents</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/55" />
              <input
                name="q"
                placeholder="Search document no., model, order code…"
                className="h-9 w-full rounded-md border border-white/15 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:bg-white/15 focus:outline-none"
              />
            </label>
          </form>
          <div className="ml-auto md:ml-2">
            <UserMenu
              name={user.fullName}
              email={user.email}
              roleLabel={ROLE_LABELS[user.role]}
              org={user.dealerName}
              isStaff={staff}
              area="portal"
            />
          </div>
        </div>
      </header>
      <nav className="hidden border-b border-border bg-surface lg:block" aria-label="Portal">
        <div className="mx-auto flex max-w-7xl gap-1 px-6">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              exact={n.exact}
              className="border-b-2 border-transparent px-3 py-3 text-sm text-muted hover:text-navy"
              activeClassName="!border-navy font-medium !text-navy"
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      {staff && (
        <div className="border-b border-amber/25 bg-amber-50 text-[13px] text-[#6b3d05]">
          <div className="mx-auto max-w-7xl px-4 py-1.5 sm:px-6">
            You are viewing the dealer portal as staff. Dealers see only published documents available to their region.{" "}
            <Link href="/admin" className="font-medium underline">
              Back to admin
            </Link>
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-subtle sm:px-6">
          <span>NSK Technical Information Portal — for authorised NSK dealers and distributors.</span>
          <span>Official documents are provided exactly as issued by NSK HQ.</span>
        </div>
      </footer>
    </div>
  );
}
