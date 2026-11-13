import type { Db } from "../db/client";
import { users } from "../db/schema";

/** A user document as exported from the old Mongo `users` collection (untrusted shape). */
export type MongoUserDoc = Record<string, unknown>;

/** Counts only: never contains emails, usernames or hashes, so it is safe to print. */
export type MigrationSummary = {
  read: number;
  inserted: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  skippedExisting: number;
};

/**
 * Turns raw Mongo user documents into rows to insert, without touching any database.
 * Drops `_id`/`__v`, lowercases emails, skips invalid docs, in-file duplicates
 * (first one wins; email compared case-insensitively) and users already in Postgres.
 * @param docs Raw documents from Mongo.
 * @param existing Usernames/emails already present in Postgres.
 * @returns Rows to insert plus skip counts.
 */
export function planMigration(
  docs: MongoUserDoc[],
  existing: { username: string; email: string }[],
): { toInsert: { username: string; email: string; password: string }[]; summary: Omit<MigrationSummary, "inserted"> } {
  const usernames = new Set(existing.map((u) => u.username));
  const emails = new Set(existing.map((u) => u.email.toLowerCase()));
  const existingKeys = { usernames: new Set(usernames), emails: new Set(emails) };
  const toInsert: { username: string; email: string; password: string }[] = [];
  const summary = { read: docs.length, skippedInvalid: 0, skippedDuplicate: 0, skippedExisting: 0 };

  for (const doc of docs) {
    const { username, email, password } = doc;
    // Mongo data is untrusted: require non-empty strings before using any field.
    if (![username, email, password].every((v) => typeof v === "string" && v.length > 0)) {
      summary.skippedInvalid++;
      continue;
    }
    const lowerEmail = (email as string).toLowerCase();
    if (existingKeys.usernames.has(username as string) || existingKeys.emails.has(lowerEmail)) {
      summary.skippedExisting++;
    } else if (usernames.has(username as string) || emails.has(lowerEmail)) {
      summary.skippedDuplicate++; // seen earlier in this same batch; first one wins
    } else {
      usernames.add(username as string);
      emails.add(lowerEmail);
      toInsert.push({ username: username as string, email: lowerEmail, password: password as string });
    }
  }
  return { toInsert, summary };
}

/**
 * Copies users from Mongo documents into Postgres inside one transaction.
 * Re-running is safe (existing users are skipped).
 * @param db Target database.
 * @param docs Raw Mongo user documents.
 * @param options.dryRun If true, plans and reports but writes nothing.
 * @returns Counts of what happened.
 * @throws If any insert fails; the transaction rolls back so nothing is written.
 */
export async function migrateUsers(
  db: Db,
  docs: MongoUserDoc[],
  options: { dryRun?: boolean } = {},
): Promise<MigrationSummary> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ username: users.username, email: users.email }).from(users);
    const { toInsert, summary } = planMigration(docs, existing);
    if (!options.dryRun && toInsert.length > 0) {
      // One multi-row INSERT inside the transaction: all rows land or none do.
      await tx.insert(users).values(toInsert);
    }
    return { ...summary, inserted: toInsert.length };
  });
}
