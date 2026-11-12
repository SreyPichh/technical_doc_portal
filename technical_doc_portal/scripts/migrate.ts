import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Database hardening, applied after every migration run (idempotent, so it also covers tables
 * added by later migrations):
 *  - Row-level security is enabled on every table in the public schema, with no policies. The app
 *    connects as the table owner, which bypasses RLS, so the portal itself is unaffected; any other
 *    role is denied every row.
 *  - On Supabase, the API roles (anon, authenticated) are stripped of all rights on the public schema
 *    and future objects, so Supabase's auto-generated REST/GraphQL API cannot read or change portal
 *    data even with the project's public API key. The portal never uses that API.
 */
async function harden(sql: postgres.Sql) {
  await sql.unsafe(`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
                 AND pg_get_userbyid(c.relowner) = current_user
      LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
      END LOOP;
    END $$;
  `);
  const [{ apiRoles }] = await sql<{ apiRoles: string[] }[]>`
    select coalesce(array_agg(rolname::text), '{}') as "apiRoles" from pg_roles where rolname in ('anon', 'authenticated')`;
  if (apiRoles.length) {
    const roles = apiRoles.map((r) => `"${r}"`).join(", ");
    await sql.unsafe(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${roles};
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${roles};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${roles};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${roles};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${roles};
    `);
  }
  return apiRoles;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✓ Database migrations applied");
  const apiRoles = await harden(sql);
  console.log(`✓ Database hardened (row-level security on${apiRoles.length ? `; API roles ${apiRoles.join(", ")} locked out` : ""})`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
