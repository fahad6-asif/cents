import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./types";
import * as schema from "./schema";

// One pooled client per server instance. `prepare: false` is required behind a
// transaction-mode pooler (Neon/Supabase pooled URLs on serverless).
const globalForDb = globalThis as unknown as { centsDb?: Db };

export function getDb(): Db {
  if (globalForDb.centsDb) return globalForDb.centsDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  globalForDb.centsDb = drizzle({ client, schema }) as unknown as Db;
  return globalForDb.centsDb;
}
