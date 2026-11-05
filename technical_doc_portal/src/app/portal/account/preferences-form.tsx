"use client";

import { useActionState } from "react";
import { updatePreferencesAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";

export function PreferencesForm({ emailNotifications }: { emailNotifications: boolean }) {
  const [state, action, pending] = useActionState(updatePreferencesAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-4">
      <label className="flex items-start gap-3 text-sm">
        <Checkbox name="emailNotifications" defaultChecked={emailNotifications} className="mt-0.5" />
        <span>
          <span className="font-medium">E-mail me when technical information is published or updated</span>
          <span className="block text-[13px] text-muted">E-mails contain a link to the portal; PDFs are not attached.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        {state?.message && <span className="text-[13px] text-green">{state.message}</span>}
        <Button type="submit" variant="secondary" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
