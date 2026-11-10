"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide (eye) button.
 * `label` names the field for screen readers, e.g. "new password" → "Show new password".
 */
export function PasswordInput({
  className,
  label = "password",
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label?: string }) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "Hide" : "Show";
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={`${action} ${label}`}
        aria-pressed={visible}
        aria-controls={props.id}
        title={`${action} ${label}`}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted hover:text-foreground cursor-pointer focus-visible:outline-offset-[-2px]"
      >
        {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  );
}
