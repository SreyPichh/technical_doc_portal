import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { Brand } from "@/components/shell/brand";
import { Alert } from "@/components/ui/misc";
import { PasswordForm } from "./password-form";
import Link from "next/link";
import { isStaff } from "@/lib/permissions";

export const metadata: Metadata = { title: "Change password" };

export default async function PasswordPage({ searchParams }: PageProps<"/account/password">) {
  const user = await requireUser({ allowPasswordChange: true });
  const required = (await searchParams).required === "1" || user.mustChangePassword;
  return (
    <main className="min-h-dvh">
      <div className="bg-navy px-5 py-4">
        <Brand />
      </div>
      <div className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-xl font-semibold">Change your password</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {user.email}</p>
        {required && (
          <Alert tone="warning" className="mt-5">
            For security, please choose a new personal password before continuing.
          </Alert>
        )}
        <PasswordForm />
        {!required && (
          <Link href={isStaff(user.role) ? "/admin" : "/portal/account"} className="mt-6 inline-block text-sm text-blue hover:underline">
            Cancel
          </Link>
        )}
      </div>
    </main>
  );
}
