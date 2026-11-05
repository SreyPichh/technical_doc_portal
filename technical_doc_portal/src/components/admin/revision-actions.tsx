"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Pencil, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  correctRevisionAction,
  publishRevisionAction,
  rejectRevisionAction,
  restoreRevisionAction,
  updateRevisionAction,
} from "@/server/actions/documents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { RevisionFields } from "./metadata-fields";

type Rev = {
  id: string;
  revisionNumber: string;
  releaseDate: string | null;
  revisionNotes: string | null;
  approvalStatus: "draft" | "published" | "superseded" | "rejected";
};

export function PublishRevisionButton({
  revision,
  isFirst,
  currentRevisionNumber,
  size = "md",
}: {
  revision: Rev;
  isFirst: boolean;
  currentRevisionNumber?: string | null;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} data-testid="publish-revision">
          <CheckCircle2 /> Approve &amp; publish
        </Button>
      </DialogTrigger>
      <DialogContent title={`Publish revision ${revision.revisionNumber}`}>
        <div className="space-y-3 text-sm">
          {isFirst ? (
            <p>This is the first publication. Dealers will see the document with a <strong>NEW</strong> label.</p>
          ) : (
            <p>
              Revision <strong>{revision.revisionNumber}</strong> becomes the current version dealers see, marked{" "}
              <strong>UPDATED</strong>. Revision {currentRevisionNumber ?? "—"} is kept in the history as a previous revision.
            </p>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-navy" />
            Notify dealers by e-mail (if enabled in Settings)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            data-testid="confirm-publish"
            onClick={() =>
              start(async () => {
                const res = await publishRevisionAction(revision.id, notify);
                if (res?.error) return void toast.error(res.error);
                toast.success(res?.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending && <LoaderCircle className="animate-spin" />} Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  trigger,
  title,
  description,
  confirm,
  danger,
  withNumber,
  defaultNumber,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  withNumber?: boolean;
  defaultNumber?: string;
  onConfirm: (reason: string, number: string) => Promise<{ error?: string; message?: string } | null>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [number, setNumber] = useState(defaultNumber ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title}>
        <p className="text-sm text-muted">{description}</p>
        {withNumber && (
          <Field label="Revision number for the restored copy" className="mt-4">
            <Input name="restoreRevisionNumber" value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" />
          </Field>
        )}
        <Field label="Reason (required)" className="mt-4">
          <Textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={pending || !reason.trim() || (withNumber && !number.trim())}
            onClick={() =>
              start(async () => {
                const res = await onConfirm(reason, number);
                if (res?.error) return void toast.error(res.error);
                toast.success(res?.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RejectRevisionButton({ revision, size = "md" }: { revision: Rev; size?: "sm" | "md" }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="danger-outline" size={size}>
          <XCircle /> Reject
        </Button>
      }
      title={`Reject draft ${revision.revisionNumber}`}
      description="The draft is marked rejected and will not be published. The file is kept for the audit trail."
      confirm="Reject draft"
      danger
      onConfirm={(reason) => rejectRevisionAction(revision.id, reason)}
    />
  );
}

export function RestoreRevisionButton({ revision, suggestedNumber }: { revision: Rev; suggestedNumber: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="secondary" size="sm">
          <RotateCcw /> Restore
        </Button>
      }
      title={`Restore revision ${revision.revisionNumber}`}
      description="A copy of this revision's original file is created as a new draft revision. Nothing is overwritten — review and publish the draft to make it current again."
      confirm="Create restored draft"
      withNumber
      defaultNumber={suggestedNumber}
      onConfirm={(reason, number) => restoreRevisionAction(revision.id, number, reason)}
    />
  );
}

export function EditRevisionButton({ revision, correction }: { revision: Rev; correction?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = correction ? correctRevisionAction.bind(null, revision.id) : updateRevisionAction.bind(null, revision.id);
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof action>>, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    }
    return res;
  }, null);
  const published = revision.approvalStatus !== "draft" && revision.approvalStatus !== "rejected";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title={correction ? "Controlled correction" : "Edit"}>
          {correction ? <ShieldAlert /> : <Pencil />}
          {correction ? "Correct" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent title={correction ? `Correct published record ${revision.revisionNumber}` : `Edit revision ${revision.revisionNumber}`} wide>
        <form action={formAction} className="space-y-4">
          {correction && (
            <Alert tone="warning">
              Published revisions are immutable. Use this only to fix a data-entry mistake in the revision number or release
              date. The file cannot be changed. The correction and its reason are permanently logged.
            </Alert>
          )}
          {!correction && published ? (
            <>
              <p className="text-sm text-muted">This revision has been published, so only its notes can be edited.</p>
              <input type="hidden" name="revisionNumber" value={revision.revisionNumber} />
              <input type="hidden" name="releaseDate" value={revision.releaseDate ?? ""} />
              <Field label="Revision notes">
                <Textarea name="revisionNotes" defaultValue={revision.revisionNotes ?? ""} rows={3} />
              </Field>
            </>
          ) : (
            <RevisionFields defaults={revision} />
          )}
          {correction && (
            <Field label="Reason for correction (required)">
              <Textarea name="reason" rows={2} required minLength={5} />
            </Field>
          )}
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
