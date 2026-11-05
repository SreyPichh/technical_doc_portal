import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-navy">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page or document does not exist, or it is not available to your account.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-blue hover:underline">
          Return to the portal
        </Link>
      </div>
    </main>
  );
}
