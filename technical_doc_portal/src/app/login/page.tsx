import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BellRing, FileCheck2, Info, Search, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/server/auth/dal";
import { isStaff } from "@/lib/permissions";
import { Brand } from "@/components/shell/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const FEATURES = [
  { icon: FileCheck2, text: "Access the latest approved technical documents." },
  { icon: BellRing, text: "Stay informed about new releases and document revisions." },
  { icon: Search, text: "Search by document number, product model or order code." },
];

/** Faint engineering grid plus the diagonal NSK panel, drawn in SVG (no images). */
function Backdrop() {
  return (
    <>
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.035]">
        <defs>
          <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
          <linearGradient id="login-grid-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="white" stopOpacity="1" />
          </linearGradient>
          <mask id="login-grid-mask">
            <rect width="100%" height="100%" fill="url(#login-grid-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-grid)" mask="url(#login-grid-mask)" />
      </svg>
      <svg aria-hidden className="pointer-events-none absolute -right-24 top-0 h-full w-72 text-white/[0.04]" viewBox="0 0 100 400" preserveAspectRatio="none">
        <polygon points="40,0 100,0 100,400 0,400" fill="currentColor" />
      </svg>
      <svg aria-hidden className="pointer-events-none absolute -right-6 top-0 h-full w-40 text-[#ff671d]" viewBox="0 0 100 400" preserveAspectRatio="none">
        <line x1="62" y1="0" x2="2" y2="400" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  );
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/portal");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Branding: full panel on desktop, a compact band above the form on phones and tablets. */}
      <section className="relative overflow-hidden bg-navy text-white" aria-labelledby="portal-title">
        <Backdrop />
        <div className="relative flex h-full flex-col px-5 pb-8 pt-5 sm:px-8 lg:px-12 lg:py-10">
          <Brand />
          <div className="mt-8 max-w-lg lg:mb-auto lg:mt-auto">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/60">Authorised dealers only</p>
            <h1 id="portal-title" className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-balance sm:text-3xl lg:text-[34px]">
              NSK Technical Information Portal
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/75 lg:mt-4 lg:text-base">
              One centralized platform for the latest official NSK technical information.
            </p>
            <ul className="mt-8 hidden gap-5 sm:grid lg:mt-10">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] ring-1 ring-white/10">
                    <Icon className="size-[18px] text-[#ff671d]" aria-hidden />
                  </span>
                  <span className="text-[15px] leading-snug text-white/85">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 hidden items-center gap-2 text-[13px] text-white/55 lg:flex">
            <ShieldCheck className="size-4" aria-hidden />
            Access is restricted to authorised NSK distributors and dealers.
          </p>
        </div>
      </section>

      <section className="flex flex-col" aria-labelledby="sign-in-title">
        <div className="flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-8 sm:py-14">
          <div className="w-full max-w-[400px]">
            <h2 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="mt-1.5 text-[15px] text-muted">Use the account provided by your NSK representative.</p>
            <div className="mt-7">
              <LoginForm next={next} />
            </div>
            <div className="mt-8 flex gap-3 border-t border-border pt-6 text-[13px] leading-relaxed text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
              <div className="space-y-2">
                <p>Forgot your password or need access to the portal? Please contact your NSK administrator for assistance.</p>
                <p>Your account is personal. Never share your login credentials with others.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
