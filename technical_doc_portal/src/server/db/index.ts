import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __nskSql: ReturnType<typeof postgres> | undefined;
}

// Reuse one pool across hot reloads in development.
const client =
  globalThis.__nskSql ??
  postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalThis.__nskSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
