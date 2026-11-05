"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, LoaderCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { createAuthoredAction, saveAuthoredAction } from "@/server/actions/authored";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { MetadataFields, RevisionFields, type MetadataOptions } from "@/components/admin/metadata-fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";

export function AuthoredForm({
  mode,
  documentId,
  options,
  initialContent,
  revisionDefaults,
  draftRevisionId,
  pdfExport,
}: {
  mode: "create" | "edit";
  documentId?: string;
  options?: MetadataOptions;
  initialContent?: unknown;
  revisionDefaults: { revisionNumber?: string; releaseDate?: string | null; revisionNotes?: string | null };
  draftRevisionId?: string;
  pdfExport: boolean;
}) {
  const [content, setContent] = useState<unknown>(initialContent ?? null);
  const action = mode === "edit" && documentId ? saveAuthoredAction.bind(null, documentId) : createAuthoredAction;
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, router]);
  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="content" value={JSON.stringify(content ?? null)} />
      {mode === "create" && options && (
        <Card>
          <CardHeader title="Document details" />
          <CardBody>
            <MetadataFields
              options={options}
              defaults={{ source: "NSK (portal-authored)", language: "English", documentTypeId: options.types[0]?.id }}
            />
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader
          title="Revision"
          description={mode === "edit" ? "Saving updates the current draft, or starts a new draft revision if none exists. Published revisions are never modified." : undefined}
        />
        <CardBody>
          <RevisionFields defaults={revisionDefaults} numberHint="Portal-authored revision label, e.g. R0" />
        </CardBody>
      </Card>
      <RichTextEditor initialContent={initialContent} documentId={documentId} onChange={setContent} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={pending} data-testid="save-authored">
          {pending && <LoaderCircle className="animate-spin" />}
          Save draft
        </Button>
        {documentId && (
          <Button asChild variant="secondary">
            <Link href={`/admin/documents/${documentId}`}>Review &amp; publish</Link>
          </Button>
        )}
        {draftRevisionId && documentId && (
          <>
            <Button asChild variant="ghost">
              <a href={`/print/documents/${documentId}?rev=${draftRevisionId}`} target="_blank" rel="noopener">
                <Printer /> Print preview
              </a>
            </Button>
            {pdfExport && (
              <Button asChild variant="ghost">
                <a href={`/api/admin/authored/${draftRevisionId}/pdf`}>
                  <Download /> Export PDF
                </a>
              </Button>
            )}
          </>
        )}
        <span className="ml-auto text-[12px] text-muted">Authored documents are labelled as portal-authored and kept separate from official HQ PDFs.</span>
      </div>
    </form>
  );
}
