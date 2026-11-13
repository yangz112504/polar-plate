import "dotenv/config";
import mongoose from "mongoose";
import { createDb } from "../db/client";
import { migrateUsers, type MongoUserDoc } from "./migrateUsers";

/**
 * One-time CLI: copies users from Mongo (MONGO_URI) into Postgres (DATABASE_URL).
 * Usage: npx tsx src/scripts/migrateMongoToPostgres.ts [--dry-run]
 * Ratings are intentionally not migrated. Prints counts only, never emails or hashes.
 */
async function main(): Promise<void> {
  const { MONGO_URI, DATABASE_URL } = process.env;
  if (!MONGO_URI || !DATABASE_URL) throw new Error("MONGO_URI and DATABASE_URL must be set in backend/.env");
  const dryRun = process.argv.includes("--dry-run");

  // The old app (server.js) explicitly used the "fansDB" database; match it.
  await mongoose.connect(MONGO_URI, { dbName: "fansDB" });
  const { db, close } = createDb(DATABASE_URL);
  try {
    // Read the raw collection so we don't depend on the old Mongoose schema.
    const docs = (await mongoose.connection.db!.collection("users").find().toArray()) as MongoUserDoc[];
    const summary = await migrateUsers(db, docs, { dryRun });
    console.log(dryRun ? "DRY RUN (nothing written):" : "Migration complete:", summary);
  } finally {
    await close();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
