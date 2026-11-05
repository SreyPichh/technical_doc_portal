"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMetadataAction } from "@/server/actions/documents";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { MetadataFields, type MetadataDefaults, type MetadataOptions } from "./metadata-fields";

export function MetadataForm({
  documentId,
  options,
  defaults,
  canEdit,
}: {
  documentId: string;
  options: MetadataOptions;
  defaults: MetadataDefaults;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateMetadataAction.bind(null, documentId), null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit} className="contents">
        <MetadataFields options={options} defaults={defaults} />
      </fieldset>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-[12px] text-muted">
          Metadata is independent of the PDF. Changes apply immediately and do not create a new revision or an UPDATED label.
        </p>
        {canEdit && (
          <Button type="submit" disabled={pending} data-testid="save-metadata">
            Save metadata
          </Button>
        )}
      </div>
    </form>
  );
}
