"use client";

import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-lg pointer-coarse:min-w-64 pointer-coarse:p-1.5", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex min-h-9 cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 text-sm outline-none pointer-coarse:min-h-12 pointer-coarse:gap-3 pointer-coarse:px-3 pointer-coarse:text-[15px] pointer-coarse:[&_svg]:size-5 data-[highlighted]:bg-navy-50 data-[disabled]:opacity-50 data-[disabled]:pointer-events-none [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-red data-[highlighted]:bg-red-50 [&_svg]:text-red",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border pointer-coarse:my-1.5" />;
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs text-muted pointer-coarse:px-3 pointer-coarse:py-2 pointer-coarse:text-[13px]", className)} {...props} />;
}
