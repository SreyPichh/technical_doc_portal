"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import { markUpdatesSeenAction } from "@/server/actions/portal";
import type { BellItem } from "@/server/services/portal-notifications";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TYPE: Record<BellItem["type"], { label: string; tone: "solidGreen" | "solidBlue" | "red" | "navy" | "neutral"; verb: string }> = {
  new: { label: "NEW", tone: "solidGreen", verb: "New document published" },
  updated: { label: "UPDATED", tone: "solidBlue", verb: "New revision published" },
  restored: { label: "REINSTATED", tone: "navy", verb: "Document reinstated" },
  withdrawn: { label: "WITHDRAWN", tone: "red", verb: "Document withdrawn" },
  archived: { label: "ARCHIVED", tone: "neutral", verb: "Document archived" },
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86_400);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Header bell: latest publication events, with an unread count that clears when opened. */
export function NotificationBell({ items, unread: initialUnread }: { items: BellItem[]; unread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [, start] = useTransition();
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <M.Root
      onOpenChange={(open) => {
        // Mark as read when the panel closes, so the unread dots stay visible while reading.
        if (!open && unread) {
          setUnread(0);
          start(() => void markUpdatesSeenAction());
        }
      }}
    >
      <M.Trigger
        className="relative flex size-10 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/10 cursor-pointer focus-visible:outline-white"
        aria-label={label}
        title="Notifications"
        data-testid="notification-bell"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[11px] font-semibold leading-[18px] text-white ring-2 ring-navy tabular"
            aria-hidden
          >
            {unread >= items.length && items.length >= 8 ? `${unread}+` : unread}
          </span>
        )}
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <M.Label className="text-sm font-semibold">Notifications</M.Label>
            {unread > 0 && <span className="text-[13px] text-muted">{unread} unread</span>}
          </div>
          {items.length ? (
            <ul className="max-h-[min(26rem,70vh)] overflow-y-auto">
              {items.map((n) => {
                const t = TYPE[n.type];
                const body = (
                  <>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread && unread ? "bg-blue" : "bg-transparent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Badge tone={t.tone}>{t.label}</Badge>
                        <span className="font-mono text-[12px] text-navy">{n.documentNumber}</span>
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium text-foreground">{n.title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {t.verb}
                        {n.revisionNumber ? ` · Rev. ${n.revisionNumber}` : ""} · {ago(n.createdAt)}
                      </span>
                    </span>
                    {n.unread && unread > 0 && <span className="sr-only">Unread</span>}
                  </>
                );
                return (
                  <li key={n.id} className="border-b border-border last:border-0">
                    {n.type === "withdrawn" ? (
                      <M.Item asChild>
                        <Link href="/portal/updates?type=withdrawn" className="flex gap-3 px-4 py-3 outline-none data-[highlighted]:bg-navy-50">
                          {body}
                        </Link>
                      </M.Item>
                    ) : (
                      <M.Item asChild>
                        <Link href={`/portal/documents/${n.documentId}`} className="flex gap-3 px-4 py-3 outline-none data-[highlighted]:bg-navy-50">
                          {body}
                        </Link>
                      </M.Item>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet. New and updated documents will appear here.</p>
          )}
          <M.Item asChild>
            <Link
              href="/portal/updates"
              className="block border-t border-border bg-grey-50 px-4 py-2.5 text-center text-sm font-medium text-blue outline-none data-[highlighted]:underline"
            >
              View all updates
            </Link>
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
