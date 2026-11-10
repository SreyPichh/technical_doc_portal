"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { changePasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert } from "@/components/ui/misc";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Current password" htmlFor="current">
        <PasswordInput id="current" name="current" label="current password" autoComplete="current-password" required />
      </Field>
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 10 characters, using three of: lowercase, uppercase, numbers, symbols."
      >
        <PasswordInput id="password" name="password" label="new password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" label="confirmed password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" />}
        Update password
      </Button>
    </form>
  );
}
