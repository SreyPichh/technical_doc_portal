import { NskLogo } from "./nsk-logo";
import { cn } from "@/lib/utils";

/** NSK logo plus the portal name. */
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
      <NskLogo className="h-[26px]" />
      {subtitle && (
        <span className={cn("border-l border-white/30 pl-3 leading-tight", compact && "hidden sm:inline")}>
          <span className="block whitespace-nowrap text-[13px] font-semibold tracking-wide">Technical Information</span>
          <span className="block text-[11px] text-white/65 tracking-wide">{area}</span>
        </span>
      )}
    </span>
  );
}
