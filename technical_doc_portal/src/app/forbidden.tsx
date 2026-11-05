import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 w-fit rounded-full bg-red-50 p-3 text-red">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted">
          Your account does not have permission to open this page. If you believe this is a mistake, please contact
          your NSK administrator.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-blue hover:underline">
          Return to the portal
        </Link>
      </div>
    </main>
  );
}
