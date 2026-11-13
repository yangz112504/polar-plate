import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { migrateUsers, planMigration, type MongoUserDoc } from "../../src/scripts/migrateUsers";

const { db, close } = createTestDb();
beforeEach(() => resetDb(db));
afterAll(() => close());

const HASH = "$2b$10$1ItD4eq6cJcDpN9G4zhzYe0d4XMAoMyYQWjjdeydvs6WyTMhPvA6q";
const mongoUser = (over: MongoUserDoc = {}): MongoUserDoc => ({
  _id: "68aa57aaede85b5ba76e4936",
  username: "RobertStLaurent",
  email: "r.stlaurent@bowdoin.edu",
  password: HASH,
  __v: 0,
  ...over,
});
const countUsers = async () => (await db.execute(sql`SELECT count(*)::int AS n FROM users`))[0].n;

describe("planMigration (pure)", () => {
  it("maps a valid user and keeps the password hash unchanged", () => {
    const { toInsert } = planMigration([mongoUser()], []);
    expect(toInsert).toEqual([{ username: "RobertStLaurent", email: "r.stlaurent@bowdoin.edu", password: HASH }]);
  });

  it("does not carry _id or __v into the output", () => {
    const [row] = planMigration([mongoUser()], []).toInsert;
    expect(row).not.toHaveProperty("_id");
    expect(row).not.toHaveProperty("__v");
  });

  it.each(["username", "email", "password"])("skips a user missing %s and counts it invalid", (field) => {
    const { toInsert, summary } = planMigration([mongoUser({ [field]: undefined })], []);
    expect(toInsert).toHaveLength(0);
    expect(summary.skippedInvalid).toBe(1);
  });

  it("keeps the first of two users with the same username", () => {
    const { toInsert, summary } = planMigration(
      [mongoUser(), mongoUser({ email: "other@bowdoin.edu" })],
      [],
    );
    expect(toInsert).toHaveLength(1);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it("treats emails differing only by case as duplicates and lowercases the kept one", () => {
    const { toInsert, summary } = planMigration(
      [mongoUser({ email: "A@Bowdoin.edu" }), mongoUser({ username: "other", email: "a@bowdoin.edu" })],
      [],
    );
    expect(toInsert.map((u) => u.email)).toEqual(["a@bowdoin.edu"]);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it("skips users that already exist in Postgres", () => {
    const { toInsert, summary } = planMigration(
      [mongoUser()],
      [{ username: "RobertStLaurent", email: "someone@else.edu" }],
    );
    expect(toInsert).toHaveLength(0);
    expect(summary.skippedExisting).toBe(1);
  });
});

describe("migrateUsers (database)", () => {
  it("inserts users and reports counts", async () => {
    const summary = await migrateUsers(db, [mongoUser(), mongoUser({ username: "b", email: "b@bowdoin.edu" })]);
    expect(summary).toMatchObject({ read: 2, inserted: 2 });
    expect(await countUsers()).toBe(2);
  });

  it("is idempotent: a second run inserts nothing", async () => {
    await migrateUsers(db, [mongoUser()]);
    const second = await migrateUsers(db, [mongoUser()]);
    expect(second).toMatchObject({ inserted: 0, skippedExisting: 1 });
    expect(await countUsers()).toBe(1);
  });

  it("does not overwrite an existing user", async () => {
    await db.execute(sql`INSERT INTO users (username, email, password) VALUES ('RobertStLaurent', 'x@y.edu', 'original')`);
    await migrateUsers(db, [mongoUser()]);
    const rows = await db.execute(sql`SELECT password FROM users`);
    expect(rows[0].password).toBe("original");
  });

  it("dry run writes nothing but still reports what it would do", async () => {
    const summary = await migrateUsers(db, [mongoUser()], { dryRun: true });
    expect(summary.inserted).toBe(1);
    expect(await countUsers()).toBe(0);
  });

  it("rolls back everything if one insert fails", async () => {
    // Postgres rejects NUL characters in text, so the second row fails the insert.
    const docs = [mongoUser(), mongoUser({ username: "bad\u0000name", email: "bad@bowdoin.edu" })];
    await expect(migrateUsers(db, docs)).rejects.toThrow();
    expect(await countUsers()).toBe(0);
  });

  it("returns a summary containing counts only (no emails or hashes)", async () => {
    const summary = await migrateUsers(db, [mongoUser()]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("@");
    expect(text).not.toContain(HASH);
    expect(Object.values(summary).every((v) => typeof v === "number")).toBe(true);
  });
});
