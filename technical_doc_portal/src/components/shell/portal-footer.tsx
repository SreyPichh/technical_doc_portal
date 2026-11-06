import Link from "next/link";
import { NskLogo } from "./nsk-logo";

const BROWSE = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/documents", label: "All documents" },
  { href: "/portal/categories", label: "Product categories" },
  { href: "/portal/updates", label: "Latest updates" },
];

const ACCOUNT = [
  { href: "/portal/saved", label: "My downloads" },
  { href: "/portal/account", label: "My account" },
  { href: "/account/password", label: "Change password" },
];

function LinkGroup({ id, title, links }: { id: string; title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-[12px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <ul className="mt-3 grid gap-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-flex min-h-8 items-center text-sm text-foreground hover:text-navy hover:underline pointer-coarse:min-h-11"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Dealer portal footer: who the portal is for, quick links, and the official-document notice. */
export function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 text-navy">
            <NskLogo className="h-5" />
            <span className="border-l border-border-strong pl-3 text-sm font-semibold">Technical Information Portal</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            The official source of NSK technical information for authorised dealers and distributors. Documents are always
            the latest approved revision.
          </p>
        </div>
        <LinkGroup id="footer-browse" title="Browse" links={BROWSE} />
        <LinkGroup id="footer-account" title="Your account" links={ACCOUNT} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {year} NSK. For authorised dealers and distributors only.</span>
          <span>Official documents are provided exactly as issued by NSK HQ.</span>
        </div>
      </div>
    </footer>
  );
}
