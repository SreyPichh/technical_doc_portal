import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/dal";
import { env } from "@/server/env";
import { getDocumentTypes, getRegions } from "@/server/services/documents";
import { getSettings } from "@/server/services/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { SettingsForm, LookupEditor } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const [settings, types, regions] = await Promise.all([getSettings(), getDocumentTypes({ includeInactive: true }), getRegions()]);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader title="Labels & notifications" />
        <CardBody>
          <SettingsForm settings={settings} emailConfigured={env.emailConfigured} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Document types" description="Inactive types stay on existing documents but cannot be chosen for new ones." />
        <CardBody>
          <LookupEditor kind="type" items={types.map((t) => ({ id: t.id, name: t.name, active: t.active }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Dealer regions" description="Assign dealers to regions to restrict documents to specific markets." />
        <CardBody>
          <LookupEditor kind="region" items={regions.map((r) => ({ id: r.id, name: r.name, code: r.code }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="System configuration" description="Set through environment variables — see .env.example." />
        <CardBody>
          <DefinitionList
            items={[
              ["File storage", env.STORAGE_DRIVER === "s3" ? `Private S3 bucket (${env.S3_BUCKET})` : "Private local folder"],
              ["Upload limit", `${env.MAX_UPLOAD_MB} MB per PDF`],
              ["Session length", `${env.SESSION_TTL_HOURS} hours`],
              ["E-mail (Resend)", env.emailConfigured ? <Badge key="e" tone="green">Configured</Badge> : <Badge key="e" tone="amber">Not configured</Badge>],
              ["PDF export (Chrome)", env.CHROME_EXECUTABLE_PATH ? <Badge key="c" tone="green">Configured</Badge> : <Badge key="c" tone="amber">Not configured — browser print is used</Badge>],
              ["OCR languages", env.OCR_LANGS],
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
