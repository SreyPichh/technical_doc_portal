import Link from "next/link";
import { requirePermission } from "@/server/auth/dal";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { bellUpdates } from "@/server/services/portal-notifications";
import { Brand } from "@/components/shell/brand";
import { UserMenu } from "@/components/shell/user-menu";
import { NavLink } from "@/components/shell/nav-link";
import { MobileNav } from "@/components/shell/mobile-nav";
import { HeaderSearch } from "@/components/shell/header-search";
import { NotificationBell } from "@/components/shell/notification-bell";

const NAV = [
  { href: "/portal", label: "Dashboard", exact: true },
  { href: "/portal/documents", label: "All Documents" },
  { href: "/portal/categories", label: "Product Categories" },
  { href: "/portal/updates", label: "Latest Updates" },
  { href: "/portal/saved", label: "My Downloads" },
];

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requirePermission("portal.view");
  const staff = can(user.role, "admin.access");
  const bell = await bellUpdates(user);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-navy focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="bg-navy">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <MobileNav items={NAV} title="NSK Technical Information" className="md:hidden" />
          <Link href="/portal" aria-label="NSK Technical Information — dashboard" className="shrink-0 rounded focus-visible:outline-white">
            <Brand compact />
          </Link>
          <HeaderSearch className="mx-auto hidden w-full max-w-xl md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <NotificationBell items={bell.items} unread={bell.unread} />
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
        <div className="px-4 pb-3 md:hidden">
          <HeaderSearch id="header-search-mobile" />
        </div>
      </header>
      <nav className="hidden border-b border-border bg-surface md:block" aria-label="Portal">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              exact={n.exact}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm text-muted transition-colors hover:border-navy-100 hover:text-navy focus-visible:outline-offset-[-2px]"
              activeClassName="!border-navy font-semibold !text-navy"
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
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[13px] text-muted sm:px-6">
          <span>NSK Technical Information Portal — for authorised NSK dealers and distributors.</span>
          <span>Official documents are provided exactly as issued by NSK HQ.</span>
        </div>
      </footer>
    </div>
  );
}
