/**
 * Create an account from the command line (e.g. the first production administrator).
 *
 *   npm run user:create -- --email admin@yourcompany.com --name "Jane Doe" --role super_admin
 *   npm run user:create -- --email dealer@shop.com --name "John" --role dealer --company "ABC Dental"
 *
 * A strong temporary password is generated and printed once; the user must
 * change it at first sign-in.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { db, schema } = await import("@/server/db");
  const { generatePassword, hashPassword } = await import("@/server/auth/password");
  const { ROLES } = await import("@/lib/permissions");
  const email = arg("email")?.toLowerCase();
  const name = arg("name");
  const role = (arg("role") ?? "dealer") as (typeof ROLES)[number];
  if (!email || !name || !ROLES.includes(role)) {
    console.error(`Usage: npm run user:create -- --email <email> --name "<full name>" --role <${ROLES.join("|")}> [--company "<dealer company>"]`);
    process.exit(1);
  }
  const password = generatePassword();
  const [u] = await db
    .insert(schema.users)
    .values({ email, fullName: name, role, dealerName: arg("company") ?? null, passwordHash: await hashPassword(password), mustChangePassword: true })
    .returning();
  await db.insert(schema.activityLogs).values({
    userId: null,
    action: "user.created",
    entityType: "user",
    entityId: u.id,
    description: `Created ${role} account ${email} from the command line`,
  });
  console.log(`✓ Created ${role} account for ${email}`);
  console.log(`  Temporary password (shown once): ${password}`);
  console.log("  The user must change it at first sign-in.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e.cause?.code === "23505" ? "An account with this e-mail already exists." : e);
  process.exit(1);
});
