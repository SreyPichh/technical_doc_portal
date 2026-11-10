"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, LoaderCircle, UserX } from "lucide-react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";

type FieldName = "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkFields(fd: FormData): FieldErrors {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const errors: FieldErrors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address, e.g. name@company.com.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

const NOTICE = {
  invalid_credentials: { icon: AlertCircle, className: "border-red/25 bg-red-50 text-[#8f0b21]" },
  inactive: { icon: UserX, className: "border-amber/30 bg-amber-50 text-[#6b3d05]" },
  rate_limited: { icon: Clock, className: "border-amber/30 bg-amber-50 text-[#6b3d05]" },
} as const;

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
      {children}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-[13px] text-red">
      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const router = useRouter();
  // Email is controlled so it survives a failed attempt; the password is cleared each time.
  const [email, setEmail] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const code = state?.data?.code;
  const succeeded = Boolean(state?.ok && state.data?.redirectTo);
  const busy = pending || succeeded;
  const serverField = code === "validation" ? (state?.data?.field as FieldName | undefined) : undefined;
  const errors: FieldErrors = { ...clientErrors };
  if (serverField && !errors[serverField] && state?.error) errors[serverField] = state.error;
  const notice = code && code !== "validation" ? NOTICE[code as keyof typeof NOTICE] : undefined;

  // After the server responds: open the portal on success, otherwise put the cursor where it helps.
  useEffect(() => {
    if (!state) return;
    if (state.ok && state.data?.redirectTo) {
      router.replace(state.data.redirectTo);
      router.refresh();
      return;
    }
    if (state.data?.code === "validation" && state.data.field === "email") emailRef.current?.focus();
    else passwordRef.current?.focus();
  }, [state, router]);

  return (
    <form
      action={action}
      noValidate
      aria-busy={busy}
      className="space-y-5"
      onSubmit={(e) => {
        const found = checkFields(new FormData(e.currentTarget));
        setClientErrors(found);
        if (found.email || found.password) {
          e.preventDefault();
          (found.email ? emailRef : passwordRef).current?.focus();
        }
      }}
    >
      <input type="hidden" name="next" value={next ?? ""} />

      <div aria-live="polite" className="empty:hidden">
        {succeeded ? (
          <div role="status" className="flex items-start gap-2.5 rounded-md border border-green/25 bg-green-50 px-3.5 py-3 text-sm text-[#0b5a40]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">{state?.message}</span> Opening the portal…
            </span>
          </div>
        ) : notice && state?.error ? (
          <div role="alert" className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm", notice.className)} data-testid="login-error">
            <notice.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="email">Email address</FieldLabel>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="name@company.com"
          required
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (clientErrors.email) setClientErrors((c) => ({ ...c, email: undefined }));
          }}
          readOnly={busy}
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="h-11 text-[15px]"
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          onChange={() => clientErrors.password && setClientErrors((c) => ({ ...c, password: undefined }))}
          readOnly={busy}
          aria-invalid={Boolean(errors.password) || undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          className="h-11 text-[15px]"
        />
        <FieldError id="password-error" message={errors.password} />
      </div>

      <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" aria-hidden />}
        {succeeded ? "Signed in" : pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
