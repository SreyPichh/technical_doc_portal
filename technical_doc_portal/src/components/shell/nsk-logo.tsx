import { NSK_LOGO_PATHS, NSK_LOGO_VIEWBOX } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** NSK logo. Inherits its colour from `currentColor` (white on the navy header). */
export function NskLogo({ className, title = "NSK" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={NSK_LOGO_VIEWBOX} className={cn("h-6 w-auto fill-current", className)} role="img" aria-label={title}>
      <title>{title}</title>
      {NSK_LOGO_PATHS.map((d) => (
        <path key={d.slice(0, 12)} d={d} />
      ))}
    </svg>
  );
}
