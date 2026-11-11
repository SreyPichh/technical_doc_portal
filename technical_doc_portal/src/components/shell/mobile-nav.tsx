"use client";

import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { Menu, X } from "lucide-react";
import { NavLink } from "./nav-link";
import { cn } from "@/lib/utils";

export function MobileNav({
  items,
  title,
  tone = "dark",
  className,
}: {
  /** `group` (optional) shows a small heading above the first item of each group. */
  items: { href: string; label: string; exact?: boolean; group?: string }[];
  title: string;
  tone?: "dark" | "light";
  /** Overrides the breakpoint at which the menu button hides (default: lg). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger
        className={cn(
          "flex size-10 items-center justify-center rounded-md lg:hidden cursor-pointer",
          tone === "dark"
            ? "text-white hover:bg-white/10 focus-visible:outline-white"
            : "hover:bg-grey-50",
          className,
        )}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#0b1530]/45" />
        <D.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <D.Title className="font-semibold">{title}</D.Title>
            <D.Description className="sr-only">Navigation</D.Description>
            <D.Close
              className="rounded p-1 hover:bg-grey-50 cursor-pointer"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </D.Close>
          </div>
          <nav className="flex flex-col p-2">
            {items.map((i, n) => (
              <div key={i.href} className="contents">
                {i.group && i.group !== items[n - 1]?.group && (
                  <p
                    className={cn(
                      "px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle",
                      n > 0 ? "pt-4" : "pt-1",
                    )}
                  >
                    {i.group}
                  </p>
                )}
                <NavLink
                  href={i.href}
                  exact={i.exact}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-[15px] text-foreground hover:bg-grey-50"
                  activeClassName="bg-navy-50 font-medium text-navy"
                >
                  {i.label}
                </NavLink>
              </div>
            ))}
          </nav>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
