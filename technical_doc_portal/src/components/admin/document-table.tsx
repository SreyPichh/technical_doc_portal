"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Ban, Eye, FileStack, History, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { DocumentListItem } from "@/server/services/documents";
import { changeStatusAction } from "@/server/actions/documents";
import { Badge, DocLabelBadge } from "@/components/ui/badge";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";

export function AdminDocumentTable({
  items,
  perms,
}: {
  items: DocumentListItem[];
  perms: { edit: boolean; upload: boolean; archive: boolean };
}) {
  const [dialog, setDialog] = useState<{ doc: DocumentListItem; action: "archive" | "withdraw" } | null>(null);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Table>
        <THead>
          <tr>
            <TH>Document</TH>
            <TH>Category</TH>
            <TH>Revision</TH>
            <TH>Last updated</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {items.map((d) => (
            <TR key={d.id} data-testid="admin-document-row">
              <TD className="max-w-[30rem]">
                <span className="font-mono text-[12px] text-navy">{d.documentNumber}</span>
                {d.kind === "authored" && (
                  <Badge tone="navy" className="ml-2">
                    Authored
                  </Badge>
                )}
                <Link href={`/admin/documents/${d.id}`} className="block font-medium leading-snug hover:text-navy hover:underline">
                  {d.title}
                </Link>
              </TD>
              <TD className="text-[13px] text-muted">
                {d.categoryName}
                {d.subcategoryName && <span className="block text-[12px] text-subtle">{d.subcategoryName}</span>}
              </TD>
              <TD className="tabular">
                <span className="font-medium">{d.revisionNumber ?? "—"}</span>
                {d.pendingRevision && (
                  <Badge tone="amber" className="ml-2">
                    Draft pending
                  </Badge>
                )}
              </TD>
              <TD className="tabular text-[13px] whitespace-nowrap">{fmtDate(d.lastPublishedAt ?? d.updatedAt)}</TD>
              <TD>
                <DocLabelBadge label={d.label} />
              </TD>
              <TD className="text-right">
                <Dropdown>
                  <DropdownTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-navy-50 cursor-pointer" aria-label={`Actions for ${d.documentNumber}`}>
                    <MoreHorizontal className="size-4" />
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem asChild>
                      <Link href={`/admin/documents/${d.id}`}>
                        <Eye /> View
                      </Link>
                    </DropdownItem>
                    {perms.edit && (
                      <DropdownItem asChild>
                        <Link href={`/admin/documents/${d.id}?tab=metadata`}>
                          <Pencil /> Edit metadata
                        </Link>
                      </DropdownItem>
                    )}
                    {perms.upload && (
                      <DropdownItem asChild>
                        <Link href={d.kind === "authored" ? `/admin/authored/${d.id}` : `/admin/upload?document=${d.id}`}>
                          <FileStack /> {d.kind === "authored" ? "Edit content (new revision)" : "Upload new revision"}
                        </Link>
                      </DropdownItem>
                    )}
                    <DropdownItem asChild>
                      <Link href={`/admin/documents/${d.id}?tab=revisions`}>
                        <History /> Version history
                      </Link>
                    </DropdownItem>
                    {perms.archive && d.status !== "archived" && d.status !== "withdrawn" && (
                      <>
                        <DropdownSeparator />
                        <DropdownItem onSelect={() => setDialog({ doc: d, action: "archive" })}>
                          <Archive /> Archive
                        </DropdownItem>
                        <DropdownItem danger onSelect={() => setDialog({ doc: d, action: "withdraw" })}>
                          <Ban /> Withdraw
                        </DropdownItem>
                      </>
                    )}
                  </DropdownContent>
                </Dropdown>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      {dialog && <StatusDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function StatusDialog({
  doc,
  action,
  onClose,
}: {
  doc: { id: string; documentNumber: string; title: string };
  action: "archive" | "withdraw" | "unpublish" | "reinstate" | "republish";
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = {
    archive: ["Archive document", "Archived documents are hidden from dealers but kept with their full history. You can reinstate them later.", "Archive"],
    withdraw: ["Withdraw document", "Use this when HQ officially withdraws the document. Dealers can no longer open it and will see a withdrawal notice in Latest Updates.", "Withdraw"],
    unpublish: ["Unpublish document", "The document is hidden from dealers immediately. Its revisions and history are kept.", "Unpublish"],
    reinstate: ["Reinstate document", "The current approved revision becomes visible to dealers again (no NEW/UPDATED label).", "Reinstate"],
    republish: ["Republish document", "The current approved revision becomes visible to dealers again (no NEW/UPDATED label).", "Republish"],
  }[action];
  const needsReason = action === "withdraw";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={copy[0]} description={`${doc.documentNumber} — ${doc.title}`}>
        <p className="text-sm text-muted">{copy[1]}</p>
        <Field label={needsReason ? "Reason (required)" : "Reason (optional)"} className="mt-4">
          <Textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        {action === "withdraw" && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-navy" />
            Notify dealers by e-mail (if enabled)
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === "withdraw" ? "danger" : "primary"}
            disabled={pending || (needsReason && !reason.trim())}
            onClick={() =>
              start(async () => {
                const res = await changeStatusAction(doc.id, action, reason, notify);
                if (res?.error) return void toast.error(res.error);
                toast.success(res?.message);
                onClose();
                router.refresh();
              })
            }
          >
            {copy[2]}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
