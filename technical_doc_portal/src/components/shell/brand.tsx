import { cn } from "@/lib/utils";

/** Text wordmark — uses the NSK brand name, no copied artwork. */
export function Brand({
  className,
  subtitle = true,
  compact,
  area = "Dealer Portal",
}: {
  className?: string;
  subtitle?: boolean;
  compact?: boolean;
  area?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-white", className)}>
      <span className="font-sans text-[22px] font-bold italic leading-none tracking-[-0.02em]" aria-label="NSK">
        NSK
      </span>
      {subtitle && (
        <span className={cn("border-l border-white/30 pl-3 leading-tight", compact && "hidden sm:inline")}>
          <span className="block text-[13px] font-semibold tracking-wide">Technical Information</span>
          <span className="block text-[11px] text-white/65 tracking-wide">{area}</span>
        </span>
      )}
    </span>
  );
}
