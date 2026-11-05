import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function globalSetup() {
  rmSync("storage-test", { recursive: true, force: true });
  const env = { ...process.env };
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server scripts/seed.ts --reset", { stdio: "inherit", env });
}
