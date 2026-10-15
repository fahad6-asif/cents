import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

type Schema = typeof schema;

/** Driver-agnostic database handle (postgres-js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: the database or an open transaction. */
export type DbOrTx = Db | Tx;
