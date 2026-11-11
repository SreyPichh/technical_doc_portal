"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "radix-ui";
import {
  FileText,
  FolderTree,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";
import { Brand } from "@/components/shell/brand";
import { NskLogo } from "@/components/shell/nsk-logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/admin-sidebar";

type Item = {
  href: string;
  label: string;
  icon: typeof FileText;
  perm: Permission;
  exact?: boolean;
  /** Shows the number of drafts awaiting approval next to this item. */
  pendingBadge?: boolean;
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: LayoutDashboard,
        perm: "admin.access",
        exact: true,
      },
      {
        href: "/admin/documents",
        label: "Document Management",
        icon: FileText,
        perm: "documents.view_all",
        pendingBadge: true,
      },
      {
        href: "/admin/upload",
        label: "Upload Documents",
        icon: Upload,
        perm: "documents.upload",
      },
      {
        href: "/admin/revisions",
        label: "Revision History",
        icon: History,
        perm: "documents.view_all",
      },
      {
        href: "/admin/categories",
        label: "Categories",
        icon: FolderTree,
        perm: "categories.manage",
      },
    ],
  },
  {
    label: "Dealer Management",
    items: [
      {
        href: "/admin/dealers",
        label: "Dealer Accounts",
        icon: Users,
        perm: "dealers.view",
      },
      {
        href: "/admin/activity",
        label: "Activity Logs",
        icon: ScrollText,
        perm: "activity.view",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        perm: "settings.manage",
      },
    ],
  },
];

/** Only the pages this role can open, so the menu never shows links that lead nowhere. */
function visibleGroups(permissions: readonly string[]) {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => permissions.includes(i.perm)),
  })).filter((g) => g.items.length);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")
    ).toUpperCase() || "?"
  );
}

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy";

/** In the collapsed rail every control gets an instant label to its right. */
function RailTip({
  show,
  label,
  children,
}: {
  show: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!show) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={10}
          className="z-50 rounded-md bg-[#0b1a38] px-2.5 py-1.5 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/10"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function AdminSidebar({
  permissions,
  userName,
  roleLabel,
  pendingApprovals,
  initiallyCollapsed,
}: {
  permissions: readonly string[];
  userName: string;
  roleLabel: string;
  /** Drafts awaiting approval (badge on Document Management). */
  pendingApprovals: number;
  initiallyCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const pathname = usePathname();
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=31536000; samesite=lax`;
  };
  const groups = visibleGroups(permissions);
  const pendingText = `${pendingApprovals} awaiting approval`;

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col bg-navy text-white transition-[width] duration-150 lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
        data-collapsed={collapsed || undefined}
        data-testid="admin-sidebar"
      >
        {/* Same height as the page header, so the two bottom borders form one line. */}
        <Link
          href="/admin"
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-white/10",
            collapsed ? "justify-center px-2" : "px-4",
            focusRing,
          )}
          aria-label="NSK Administration — Overview"
        >
          {collapsed ? (
            <NskLogo className="h-[17px] text-white" />
          ) : (
            <Brand area="Administration" className="gap-2.5" />
          )}
        </Link>

        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
          aria-label="Admin"
        >
          {groups.map((g, gi) => (
            <div
              key={g.label}
              className={cn(
                gi > 0 &&
                  (collapsed ? "mt-3 border-t border-white/10 pt-3" : "mt-5"),
              )}
            >
              {collapsed ? (
                <span className="sr-only">{g.label}</span>
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                  {g.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map(
                  ({ href, label, icon: Icon, exact, pendingBadge }) => {
                    const active = exact
                      ? pathname === href
                      : pathname === href || pathname.startsWith(href + "/");
                    const badge = pendingBadge && pendingApprovals > 0;
                    return (
                      <li key={href}>
                        <RailTip
                          show={collapsed}
                          label={badge ? `${label} · ${pendingText}` : label}
                        >
                          <Link
                            href={href}
                            aria-current={active ? "page" : undefined}
                            aria-label={
                              collapsed
                                ? badge
                                  ? `${label}, ${pendingText}`
                                  : label
                                : undefined
                            }
                            className={cn(
                              "relative flex h-9 items-center rounded-md text-sm transition-colors",
                              collapsed ? "justify-center" : "gap-3 pl-3 pr-2",
                              active
                                ? "bg-white/12 font-medium text-white"
                                : "text-white/80 hover:bg-white/[0.06] hover:text-white",
                              focusRing,
                            )}
                          >
                            {active && (
                              <span
                                className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-red"
                                aria-hidden
                              />
                            )}
                            <span className="relative">
                              <Icon
                                className={cn(
                                  "size-[18px] shrink-0",
                                  active ? "opacity-100" : "opacity-80",
                                )}
                                aria-hidden
                              />
                              {badge && collapsed && (
                                <span
                                  className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400 ring-2 ring-navy"
                                  aria-hidden
                                />
                              )}
                            </span>
                            {!collapsed && (
                              <span className="min-w-0 flex-1 truncate">
                                {label}
                              </span>
                            )}
                            {badge && !collapsed && (
                              <span
                                className="rounded-full bg-amber-400/20 px-1.5 py-px text-[11px] font-semibold tabular text-amber-200"
                                title={pendingText}
                                data-testid="pending-badge"
                              >
                                {pendingApprovals}
                                <span className="sr-only">
                                  {" "}
                                  awaiting approval
                                </span>
                              </span>
                            )}
                          </Link>
                        </RailTip>
                      </li>
                    );
                  },
                )}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <RailTip show={collapsed} label="Expand sidebar">
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "flex h-9 w-full cursor-pointer items-center rounded-md text-[13px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white",
                collapsed ? "justify-center" : "gap-3 px-3",
                focusRing,
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              data-testid="sidebar-toggle"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[18px]" aria-hidden />
              ) : (
                <PanelLeftClose className="size-[18px]" aria-hidden />
              )}
              {!collapsed && "Collapse sidebar"}
            </button>
          </RailTip>
          <RailTip show={collapsed} label={`${userName} · ${roleLabel}`}>
            <div
              className={cn(
                "mt-2 flex items-center gap-3 rounded-md py-1.5",
                collapsed ? "justify-center" : "px-2",
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[12px] font-semibold ring-1 ring-white/15"
                aria-hidden
              >
                {initials(userName)}
              </span>
              {collapsed ? (
                <span className="sr-only">
                  Signed in as {userName}, {roleLabel}
                </span>
              ) : (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-medium">
                    {userName}
                  </span>
                  <span className="block truncate text-[11px] text-white/60">
                    {roleLabel}
                  </span>
                </span>
              )}
            </div>
          </RailTip>
        </div>
      </aside>
    </Tooltip.Provider>
  );
}

/** The same grouped menu in the slide-out panel on phones and tablets. */
export function AdminMobileNav({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const items = visibleGroups(permissions).flatMap((g) =>
    g.items.map(({ href, label, exact }) => ({
      href,
      label,
      exact,
      group: g.label,
    })),
  );
  return <MobileNav items={items} title="NSK Administration" tone="light" />;
}
