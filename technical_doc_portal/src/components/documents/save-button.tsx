"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { toggleSavedAction } from "@/server/actions/portal";
import { Button } from "@/components/ui/button";

export function SaveButton({ documentId, initial }: { documentId: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleSavedAction(documentId);
          if ("error" in res && res.error) return void toast.error(res.error);
          setSaved(res.saved);
          toast.success(res.saved ? "Saved to your documents" : "Removed from saved documents");
        })
      }
      aria-pressed={saved}
    >
      {saved ? <BookmarkCheck className="text-navy" /> : <Bookmark />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
