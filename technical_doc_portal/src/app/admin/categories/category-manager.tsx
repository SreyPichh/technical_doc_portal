"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import {
  createCategoryAction,
  moveCategoryAction,
  setCategoryStatusAction,
  updateCategoryAction,
} from "@/server/actions/categories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { CategoryNode } from "@/server/services/documents";

type Cat = Omit<CategoryNode, "children">;

export function CategoryManager({ tree, counts }: { tree: CategoryNode[]; counts: Record<string, number> }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CategoryDialog mode="create" trigger={<Button><Plus /> New category</Button>} />
      </div>
      {tree.map((c, i) => (
        <section key={c.id} className={cn("rounded-lg border border-border bg-surface shadow-xs", c.status === "inactive" && "opacity-70")} data-testid="category-block">
          <Row cat={c} count={counts[c.id] ?? 0} first={i === 0} last={i === tree.length - 1} top />
          <div className="border-t border-border bg-grey-50/40">
            {c.children.map((s, j) => (
              <Row key={s.id} cat={s} count={counts[s.id] ?? 0} first={j === 0} last={j === c.children.length - 1} />
            ))}
            <div className="px-4 py-2 pl-14">
              <CategoryDialog
                mode="create"
                parent={c}
                trigger={
                  <Button variant="ghost" size="sm" className="text-blue">
                    <Plus /> Add subcategory
                  </Button>
                }
              />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({ cat, count, first, last, top }: { cat: Cat; count: number; first: boolean; last: boolean; top?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ error?: string; message?: string } | null>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else if (res?.message) toast.success(res.message);
      router.refresh();
    });
  return (
    <div className={cn("flex flex-wrap items-center gap-3 px-4", top ? "py-3.5" : "border-b border-border/70 py-2 pl-8 last:border-0")}>
      <div className="min-w-0 flex-1">
        <p className={cn(top ? "font-semibold" : "text-sm")}>
          {cat.name}
          {cat.status === "inactive" && (
            <Badge tone="neutral" className="ml-2">
              Inactive
            </Badge>
          )}
        </p>
        {top && cat.description && <p className="text-[13px] text-muted">{cat.description}</p>}
      </div>
      <span className="text-[12px] tabular text-muted">{count} docs</span>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" disabled={first || pending} onClick={() => run(() => moveCategoryAction(cat.id, "up"))} aria-label={`Move ${cat.name} up`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={last || pending} onClick={() => run(() => moveCategoryAction(cat.id, "down"))} aria-label={`Move ${cat.name} down`}>
          <ArrowDown />
        </Button>
        <CategoryDialog
          mode="edit"
          category={cat}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cat.name}`}>
              <Pencil />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          onClick={() => run(() => setCategoryStatusAction(cat.id, cat.status === "active" ? "inactive" : "active"))}
          aria-label={cat.status === "active" ? `Deactivate ${cat.name}` : `Activate ${cat.name}`}
          title={cat.status === "active" ? "Deactivate" : "Activate"}
        >
          <Power className={cat.status === "active" ? "text-green" : "text-subtle"} />
        </Button>
      </div>
    </div>
  );
}

function CategoryDialog({
  mode,
  category,
  parent,
  trigger,
}: {
  mode: "create" | "edit";
  category?: Cat;
  parent?: Cat;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = mode === "edit" && category ? updateCategoryAction.bind(null, category.id) : createCategoryAction;
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof action>>, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    }
    return res;
  }, null);
  const isSub = Boolean(parent || category?.parentId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={mode === "edit" ? `Edit ${isSub ? "subcategory" : "category"}` : parent ? `New subcategory in ${parent.name}` : "New category"}
      >
        <form action={formAction} className="space-y-4">
          {parent && <input type="hidden" name="parentId" value={parent.id} />}
          <Field label="Name" required>
            <Input name="name" defaultValue={category?.name} required maxLength={80} autoFocus />
          </Field>
          {!isSub && (
            <>
              <Field label="Description">
                <Textarea name="description" defaultValue={category?.description ?? ""} rows={2} maxLength={300} />
              </Field>
            </>
          )}
          {isSub && <input type="hidden" name="description" value={category?.description ?? ""} />}
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === "edit" ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
