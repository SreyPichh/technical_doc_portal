import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/server/auth/dal";
import { db, schema } from "@/server/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DefinitionList, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/utils";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: PageProps<"/portal/account">) {
  const user = await requirePermission("portal.view");
  const [row] = await db
    .select({ u: schema.users, region: schema.regions.name })
    .from(schema.users)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(eq(schema.users.id, user.id));
  const pw = (await searchParams).pw === "1";
  return (
    <div className="max-w-3xl">
      <PageHeader title="My account" />
      {pw && (
        <Alert tone="success" className="mb-4">
          Your password has been changed.
        </Alert>
      )}
      <div className="space-y-4">
        <Card>
          <CardHeader title="Profile" description="Contact your NSK administrator to change these details." />
          <CardBody>
            <DefinitionList
              items={[
                ["Name", row.u.fullName],
                ["E-mail", row.u.email],
                ["Company", row.u.dealerName ?? "—"],
                ["Region", row.region ?? "—"],
                ["Role", ROLE_LABELS[row.u.role]],
                ["Last sign-in", fmtDateTime(row.u.lastLoginAt)],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Notifications" />
          <CardBody>
            <PreferencesForm emailNotifications={row.u.emailNotifications} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Security"
            action={
              <Link href="/account/password" className="text-sm font-medium text-blue hover:underline">
                Change password
              </Link>
            }
          />
          <CardBody className="text-sm text-muted">
            Your account is personal. Changing your password signs you out on all other devices.
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
