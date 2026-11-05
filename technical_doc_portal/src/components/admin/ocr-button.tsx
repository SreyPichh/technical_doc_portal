"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ScanText } from "lucide-react";
import { toast } from "sonner";
import { runOcrAction } from "@/server/actions/documents";
import { Button } from "@/components/ui/button";

const LABELS = {
  not_needed: "Run OCR",
  recommended: "Scanned PDF — run OCR to make it searchable",
  running: "OCR in progress…",
  done: "OCR complete — run again",
  failed: "OCR failed — try again",
} as const;

export function OcrButton({ revisionId, status }: { revisionId: string; status: keyof typeof LABELS }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-1.5">
      <Button
        variant={status === "recommended" || status === "failed" ? "primary" : "secondary"}
        size="sm"
        className="w-full"
        disabled={pending || status === "running"}
        onClick={() =>
          start(async () => {
            const res = await runOcrAction(revisionId);
            if (res?.error) return void toast.error(res.error);
            toast.success(res?.message);
            router.refresh();
          })
        }
      >
        {pending || status === "running" ? <LoaderCircle className="animate-spin" /> : <ScanText />}
        {status === "recommended" ? "Run OCR" : LABELS[status]}
      </Button>
      {status === "recommended" && <p className="text-[12px] text-muted">{LABELS.recommended}. The original PDF is not modified.</p>}
    </div>
  );
}
