"use client";

import { useState } from "react";
import { Archive, Ban, EyeOff, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDialog } from "./document-table";

type Action = "archive" | "withdraw" | "unpublish" | "reinstate" | "republish";

export function LifecycleButtons({
  doc,
  status,
  hasCurrent,
  canPublish,
  canArchive,
}: {
  doc: { id: string; documentNumber: string; title: string };
  status: "draft" | "published" | "archived" | "withdrawn";
  hasCurrent: boolean;
  canPublish: boolean;
  canArchive: boolean;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const buttons: [Action, React.ReactNode, string, "secondary" | "danger-outline"][] = [];
  if (canPublish && status === "published") buttons.push(["unpublish", <EyeOff key="i" />, "Unpublish", "secondary"]);
  if (canPublish && status === "draft" && hasCurrent) buttons.push(["republish", <Send key="i" />, "Republish", "secondary"]);
  if (canArchive && (status === "published" || status === "draft")) {
    buttons.push(["archive", <Archive key="i" />, "Archive", "secondary"]);
    buttons.push(["withdraw", <Ban key="i" />, "Withdraw", "danger-outline"]);
  }
  if (canArchive && (status === "archived" || status === "withdrawn") && hasCurrent)
    buttons.push(["reinstate", <RotateCcw key="i" />, "Reinstate", "secondary"]);
  return (
    <>
      {buttons.map(([a, icon, label, variant]) => (
        <Button key={a} variant={variant} onClick={() => setAction(a)}>
          {icon}
          {label}
        </Button>
      ))}
      {action && <StatusDialog doc={doc} action={action} onClose={() => setAction(null)} />}
    </>
  );
}
