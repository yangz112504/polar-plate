import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Drizzle database handle type used by all repositories. */
export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates a Drizzle client backed by a postgres-js connection pool.
 * @param url Postgres connection string (Supabase in production, Docker in tests).
 * @returns `db` for queries and `close` to end the pool.
 */
export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url);
  return { db: drizzle(sql, { schema }), close: () => sql.end() };
}
