"use client";

import Link from "next/link";
import { startTransition } from "react";
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, UserRound, Eye } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  roleLabel,
  org,
  isStaff,
  area,
  tone = "dark",
}: {
  name: string;
  email: string;
  roleLabel: string;
  org?: string | null;
  isStaff: boolean;
  area: "portal" | "admin";
  tone?: "dark" | "light";
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Dropdown>
      <DropdownTrigger
        className={cn(
          "flex min-h-10 items-center gap-2 rounded-md px-1.5 py-1 text-sm cursor-pointer",
          tone === "dark" ? "text-white hover:bg-white/10 focus-visible:outline-white" : "text-foreground hover:bg-grey-50",
        )}
        data-testid="user-menu"
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-[12px] font-semibold",
            tone === "dark" ? "bg-white/15 text-white" : "bg-navy text-white",
          )}
        >
          {initials}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-40 truncate font-medium">{name}</span>
          <span className={cn("block max-w-40 truncate text-[11px]", tone === "dark" ? "text-white/60" : "text-muted")}>
            {org ?? roleLabel}
          </span>
        </span>
        <ChevronDown className="size-4 opacity-70" />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>
          <span className="block font-medium text-foreground">{name}</span>
          <span className="block truncate">{email}</span>
          <span className="block">{roleLabel}</span>
        </DropdownLabel>
        <DropdownSeparator />
        {area === "portal" ? (
          <DropdownItem asChild>
            <Link href="/portal/account">
              <UserRound /> My account
            </Link>
          </DropdownItem>
        ) : null}
        {isStaff && area === "portal" && (
          <DropdownItem asChild>
            <Link href="/admin">
              <LayoutDashboard /> Admin dashboard
            </Link>
          </DropdownItem>
        )}
        {isStaff && area === "admin" && (
          <DropdownItem asChild>
            <Link href="/portal">
              <Eye /> View dealer portal
            </Link>
          </DropdownItem>
        )}
        <DropdownItem asChild>
          <Link href="/account/password">
            <KeyRound /> Change password
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={() => startTransition(() => logoutAction())} data-testid="sign-out">
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
