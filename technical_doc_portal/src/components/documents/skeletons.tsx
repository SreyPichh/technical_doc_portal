/** Placeholder shapes shown while portal pages load (no animation when reduced motion is requested). */
function Bar({ className }: { className: string }) {
  return <span className={`block rounded bg-grey-50 motion-safe:animate-pulse ${className}`} />;
}

export function DocumentCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface shadow-xs" aria-hidden>
      <div className="flex-1 space-y-2.5 p-4">
        <div className="flex justify-between">
          <Bar className="h-4 w-24" />
          <Bar className="h-4 w-14" />
        </div>
        <Bar className="h-5 w-11/12" />
        <Bar className="h-5 w-2/3" />
        <Bar className="h-4 w-1/2" />
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Bar className="h-8" />
          <Bar className="h-8" />
          <Bar className="h-8" />
        </div>
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 flex-1" />
      </div>
    </div>
  );
}

export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
