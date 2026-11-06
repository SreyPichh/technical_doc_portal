import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-subtle shadow-xs transition-colors focus:outline-none focus:border-navy disabled:opacity-60 disabled:bg-grey-50 aria-[invalid=true]:border-red";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "py-2 min-h-20 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        fieldBase,
        "h-9 appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235d6b82%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-foreground", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Link the label to its control automatically when no explicit id is given.
  let control = children;
  let forId = htmlFor;
  if (!forId && React.isValidElement<{ id?: string; name?: string }>(children)) {
    const p = children.props;
    forId = p.id ?? (p.name ? `field-${p.name}` : undefined);
    if (forId && !p.id) control = React.cloneElement(children, { id: forId });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={forId}>
        {label}
        {required && <span className="text-red ml-0.5" aria-hidden>*</span>}
      </Label>
      {control}
      {error ? <p className="text-xs text-red">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 rounded border-border-strong accent-navy cursor-pointer", className)}
      {...props}
    />
  );
}
