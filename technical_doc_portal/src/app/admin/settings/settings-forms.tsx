"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { saveDocumentTypeAction, saveRegionAction, saveSettingsAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

type Settings = {
  newLabelDays: number;
  updatedLabelDays: number;
  emailNotificationsEnabled: boolean;
  notifyOnNew: boolean;
  notifyOnUpdate: boolean;
  notifyOnWithdrawal: boolean;
};

export function SettingsForm({ settings, emailConfigured }: { settings: Settings; emailConfigured: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Show NEW label for (days)" hint="After first publication.">
          <Input type="number" name="newLabelDays" min={1} max={365} defaultValue={settings.newLabelDays} required />
        </Field>
        <Field label="Show UPDATED label for (days)" hint="After a new revision is published.">
          <Input type="number" name="updatedLabelDays" min={1} max={365} defaultValue={settings.updatedLabelDays} required />
        </Field>
      </div>
      <p className="text-[12px] text-muted">
        Labels are driven only by publication events — a document cannot be marked NEW manually. After the period ends the
        label changes to CURRENT.
      </p>
      <fieldset className="space-y-2 rounded-md border border-border p-4">
        <legend className="px-1 text-[13px] font-medium">E-mail notifications to dealers</legend>
        {!emailConfigured && (
          <Alert tone="warning">
            E-mail delivery is not configured (RESEND_API_KEY and EMAIL_FROM). Publication events are still recorded and shown in
            Latest Updates.
          </Alert>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="emailNotificationsEnabled" defaultChecked={settings.emailNotificationsEnabled} /> Enable e-mail notifications
        </label>
        <div className="space-y-2 pl-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="notifyOnNew" defaultChecked={settings.notifyOnNew} /> New documents
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="notifyOnUpdate" defaultChecked={settings.notifyOnUpdate} /> New revisions (updates)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="notifyOnWithdrawal" defaultChecked={settings.notifyOnWithdrawal} /> Withdrawals
          </label>
        </div>
        <p className="text-[12px] text-muted">E-mails link to the portal; PDFs are never attached. Dealers can opt out under My Account.</p>
      </fieldset>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        Save settings
      </Button>
    </form>
  );
}

type Item = { id: string; name: string; active?: boolean; code?: string };

export function LookupEditor({ kind, items }: { kind: "type" | "region"; items: Item[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const save = (id: string | null, name: string, extra: { active?: boolean; code?: string }) =>
    start(async () => {
      const res =
        kind === "type" ? await saveDocumentTypeAction(id, name, extra.active ?? true) : await saveRegionAction(id, name, extra.code ?? "");
      if (res?.error) return void toast.error(res.error);
      toast.success(res?.message);
      if (!id) {
        setNewName("");
        setNewCode("");
      }
      router.refresh();
    });
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <LookupRow key={it.id} kind={kind} item={it} pending={pending} onSave={save} />
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={kind === "type" ? "New document type" : "New region name"} className="max-w-xs" />
        {kind === "region" && <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code" className="w-24 font-mono" />}
        <Button variant="secondary" disabled={pending || !newName.trim()} onClick={() => save(null, newName, { code: newCode })}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}

function LookupRow({
  kind,
  item,
  pending,
  onSave,
}: {
  kind: "type" | "region";
  item: Item;
  pending: boolean;
  onSave: (id: string, name: string, extra: { active?: boolean; code?: string }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [code, setCode] = useState(item.code ?? "");
  const dirty = name !== item.name || code !== (item.code ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" aria-label="Name" />
      {kind === "region" && <Input value={code} onChange={(e) => setCode(e.target.value)} className="w-24 font-mono" aria-label="Code" />}
      {kind === "type" && (item.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>)}
      {dirty && (
        <Button size="sm" disabled={pending} onClick={() => onSave(item.id, name, { active: item.active, code })}>
          Save
        </Button>
      )}
      {kind === "type" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSave(item.id, item.name, { active: !item.active })}>
          {item.active ? "Deactivate" : "Activate"}
        </Button>
      )}
    </div>
  );
}
