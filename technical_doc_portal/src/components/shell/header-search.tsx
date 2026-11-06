import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Search box in the navy portal header (plain GET form, so it works without JavaScript). */
export function HeaderSearch({ className, id = "header-search" }: { className?: string; id?: string }) {
  return (
    <form action="/portal/documents" className={cn("relative", className)} role="search" aria-label="Search technical information">
      <label htmlFor={id} className="sr-only">
        Search technical information
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" aria-hidden />
      <input
        id={id}
        name="q"
        type="search"
        enterKeyHint="search"
        placeholder="Search document no., title, model or order code"
        className="h-10 w-full rounded-md border border-white/20 bg-white/10 pl-9 pr-11 text-sm text-white placeholder:text-white/60 hover:border-white/35 focus:border-white/70 focus:bg-white/15 focus:outline-none"
      />
      <button
        type="submit"
        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white cursor-pointer focus-visible:outline-white"
        aria-label="Search"
      >
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
