"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  exact,
  className,
  activeClassName,
  children,
  onClick,
  title,
  ariaLabel,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(className, active && activeClassName)}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
