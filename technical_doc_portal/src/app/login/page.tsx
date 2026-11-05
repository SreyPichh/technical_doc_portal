import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { isStaff } from "@/lib/permissions";
import { Brand } from "@/components/shell/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/portal");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy px-12 py-10 text-white lg:flex lg:flex-col">
        <Brand />
        <div className="my-auto max-w-lg">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/60">Authorised dealers only</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight">NSK Technical Information Portal</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            One place for current technical information issued by NSK Head Quarters: labelling changes, product
            changes, specifications and service information, always in their latest approved revision.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              "Latest approved revisions, clearly labelled NEW and UPDATED",
              "Original HQ documents, previewed and downloaded unchanged",
              "Search by document number, product model or order code",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-red" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/45">Access is restricted to authorised NSK distributors and dealers.</p>
        <svg aria-hidden className="pointer-events-none absolute -right-24 top-0 h-full w-72 text-white/[0.04]" viewBox="0 0 100 400" preserveAspectRatio="none">
          <polygon points="40,0 100,0 100,400 0,400" fill="currentColor" />
        </svg>
      </section>
      <section className="flex flex-col">
        <div className="bg-navy px-5 py-4 lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-12">
          <div className="w-full max-w-sm">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use the account provided by your NSK representative.</p>
            <LoginForm next={next} />
            <p className="mt-8 text-xs leading-relaxed text-subtle">
              Forgotten your password or need an account? Contact your NSK administrator. Accounts are personal —
              please do not share your sign-in details.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
