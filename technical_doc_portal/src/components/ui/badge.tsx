import * as React from "react";
import { cn } from "@/lib/utils";
import type { DocLabel } from "@/lib/labels";

const tones = {
  neutral: "bg-grey-50 text-muted border-border",
  navy: "bg-navy-50 text-navy border-navy-100",
  green: "bg-green-50 text-green border-green/20",
  blue: "bg-blue-50 text-blue border-blue/20",
  red: "bg-red-50 text-red border-red/20",
  amber: "bg-amber-50 text-amber border-amber/25",
  solidGreen: "bg-green text-white border-green",
  solidBlue: "bg-blue text-white border-blue",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const LABEL_TONES: Record<DocLabel, keyof typeof tones> = {
  NEW: "solidGreen",
  UPDATED: "solidBlue",
  CURRENT: "green",
  ARCHIVED: "neutral",
  WITHDRAWN: "red",
  DRAFT: "amber",
};

export function DocLabelBadge({ label, className }: { label: DocLabel; className?: string }) {
  return (
    <Badge tone={LABEL_TONES[label]} className={className} data-label={label}>
      {label}
    </Badge>
  );
}

const REV_TONES = {
  draft: ["amber", "Awaiting review"],
  published: ["green", "Current"],
  superseded: ["neutral", "Previous"],
  rejected: ["red", "Rejected"],
} as const;

export function RevisionStatusBadge({ status }: { status: keyof typeof REV_TONES }) {
  const [tone, text] = REV_TONES[status];
  return <Badge tone={tone}>{text}</Badge>;
}
