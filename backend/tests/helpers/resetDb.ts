import { sql } from "drizzle-orm";
import type { Db } from "../../src/db/client";

/** Empties every table so each test starts from a clean slate. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE users, meals, ratings CASCADE`);
}
