"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, MoreHorizontal, Pencil, Power, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createUserAction, resetPasswordAction, setUserStatusAction, updateUserAction } from "@/server/actions/users";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

type Row = {
  id: string;
  fullName: string;
  email: string;
  dealerName: string | null;
  regionId: string | null;
  region: string | null;
  role: Role;
  status: "active" | "suspended";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  downloads: number;
};

const fmt = (s: string | null) => (s ? s.slice(0, 10) : "—");

export function DealerManager({
  rows,
  regions,
  staffView,
  query,
  canManage,
  canManageStaff,
  currentUserId,
}: {
  rows: Row[];
  regions: { id: string; name: string }[];
  staffView: boolean;
  query: string;
  canManage: boolean;
  canManageStaff: boolean;
  currentUserId: string;
}) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ error?: string; message?: string; data?: Record<string, string> } | null>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) return void toast.error(res.error);
      if (res?.data?.password) setSecret({ email: res.data.email, password: res.data.password });
      else toast.success(res?.message);
      router.refresh();
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative" action="/admin/dealers">
          {staffView && <input type="hidden" name="view" value="staff" />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input name="q" defaultValue={query} placeholder="Search name, e-mail, company" className="w-72 pl-9" />
        </form>
        {canManage && (
          <Button className="ml-auto" onClick={() => setEditing("new")} data-testid="new-dealer">
            <UserPlus /> {staffView ? "New staff account" : "New dealer account"}
          </Button>
        )}
      </div>
      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>{staffView ? "Role" : "Company"}</TH>
                <TH>Region</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                <TH>Downloads</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id} data-testid="dealer-row">
                  <TD>
                    <span className="block font-medium">{r.fullName}</span>
                    <span className="text-[12px] text-muted">{r.email}</span>
                  </TD>
                  <TD className="text-[13px]">{staffView ? ROLE_LABELS[r.role] : (r.dealerName ?? "—")}</TD>
                  <TD className="text-[13px]">{r.region ?? "—"}</TD>
                  <TD>
                    {r.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}
                    {r.mustChangePassword && r.status === "active" && (
                      <span className="mt-1 block text-[11px] text-muted">Awaiting first sign-in</span>
                    )}
                  </TD>
                  <TD className="tabular text-[13px]">{fmt(r.lastLoginAt)}</TD>
                  <TD className="tabular text-[13px]">{r.downloads}</TD>
                  <TD className="text-right">
                    {canManage && (staffView ? canManageStaff : true) && (
                      <Dropdown>
                        <DropdownTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-navy-50 cursor-pointer" aria-label={`Actions for ${r.email}`}>
                          <MoreHorizontal className="size-4" />
                        </DropdownTrigger>
                        <DropdownContent>
                          <DropdownItem onSelect={() => setEditing(r)}>
                            <Pencil /> Edit account
                          </DropdownItem>
                          <DropdownItem disabled={pending} onSelect={() => run(() => resetPasswordAction(r.id))}>
                            <KeyRound /> Reset password
                          </DropdownItem>
                          {r.id !== currentUserId && (
                            <>
                              <DropdownSeparator />
                              <DropdownItem
                                danger={r.status === "active"}
                                disabled={pending}
                                onSelect={() => run(() => setUserStatusAction(r.id, r.status === "active" ? "suspended" : "active"))}
                              >
                                <Power /> {r.status === "active" ? "Suspend access" : "Restore access"}
                              </DropdownItem>
                            </>
                          )}
                        </DropdownContent>
                      </Dropdown>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={query ? "No matching accounts" : "No accounts yet"} />
        )}
      </Card>

      {editing && (
        <UserDialog
          row={editing === "new" ? null : editing}
          regions={regions}
          staffView={staffView}
          canManageStaff={canManageStaff}
          onClose={() => setEditing(null)}
          onCreated={(s) => {
            setEditing(null);
            setSecret(s);
            router.refresh();
          }}
        />
      )}

      {secret && (
        <Dialog open onOpenChange={(o) => !o && setSecret(null)}>
          <DialogContent title="Temporary password" description="Shown once. Share it with the user through a secure channel.">
            <div className="space-y-3 text-sm">
              <p>
                Account: <strong>{secret.email}</strong>
              </p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-grey-50 px-3 py-2">
                <code className="flex-1 font-mono text-[15px]" data-testid="temp-password">
                  {secret.password}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(secret.password).then(() => toast.success("Copied"))}
                >
                  <Copy /> Copy
                </Button>
              </div>
              <p className="text-muted">The user must choose a new personal password at first sign-in. It cannot be displayed again.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setSecret(null)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function UserDialog({
  row,
  regions,
  staffView,
  canManageStaff,
  onClose,
  onCreated,
}: {
  row: Row | null;
  regions: { id: string; name: string }[];
  staffView: boolean;
  canManageStaff: boolean;
  onClose: () => void;
  onCreated: (s: { email: string; password: string }) => void;
}) {
  const router = useRouter();
  const action = row ? updateUserAction.bind(null, row.id) : createUserAction;
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof action>>, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      if (res.data?.password) onCreated({ email: res.data.email, password: res.data.password });
      else {
        toast.success(res.message);
        onClose();
        router.refresh();
      }
    }
    return res;
  }, null);
  const [role, setRole] = useState<Role>(row?.role ?? (staffView ? "admin" : "dealer"));
  const roleOptions = canManageStaff ? ROLES : (["dealer"] as const);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={row ? `Edit ${row.fullName}` : staffView ? "New staff account" : "New dealer account"} wide>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" required>
            <Input name="fullName" defaultValue={row?.fullName} required />
          </Field>
          <Field label="E-mail address" required hint="Used to sign in.">
            <Input name="email" type="email" defaultValue={row?.email} required />
          </Field>
          <Field label="Dealer company" required={role === "dealer"}>
            <Input name="dealerName" defaultValue={row?.dealerName ?? ""} />
          </Field>
          <Field label="Region" hint="Controls access to region-restricted documents.">
            <Select name="regionId" defaultValue={row?.regionId ?? ""}>
              <option value="">No region</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          {roleOptions.length > 1 ? (
            <Field label="Role" className="md:col-span-2">
              <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="role" value="dealer" />
          )}
          {state?.error && (
            <Alert tone="danger" className="md:col-span-2">
              {state.error}
            </Alert>
          )}
          {!row && (
            <p className="text-[12px] text-muted md:col-span-2">
              A temporary password is generated and shown once after creating the account.
            </p>
          )}
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-testid="save-user">
              {row ? "Save" : "Create account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
