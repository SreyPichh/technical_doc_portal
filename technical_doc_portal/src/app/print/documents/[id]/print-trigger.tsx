"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-sm">
      <span className="text-muted">Choose “Save as PDF” in the print dialog to export.</span>
      <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-navy px-3 py-1.5 text-white cursor-pointer">
        <Printer className="size-4" /> Print
      </button>
    </div>
  );
}
