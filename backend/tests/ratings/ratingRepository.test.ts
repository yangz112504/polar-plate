import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { createUserRepository } from "../../src/users/userRepository";
import { createMealRepository } from "../../src/meals/mealRepository";
import { createRatingRepository, InvalidScoreError } from "../../src/ratings/ratingRepository";

const { db, close } = createTestDb();
const users = createUserRepository(db);
const meals = createMealRepository(db);
const repo = createRatingRepository(db);

let userId: string;
let mealId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await users.createUser({ username: "alice", email: "a@example.com", password: "h" })).id;
  mealId = (await meals.getOrCreateMeal("2026-11-12", "Thorne", "Lunch")).id;
});
afterAll(() => close());

const countRows = async () => (await db.execute(sql`SELECT count(*)::int AS n FROM ratings`))[0].n;

describe("ratingRepository.upsertRating", () => {
  it("inserts on first call and updates on the second, keeping one row", async () => {
    expect(await repo.upsertRating({ userId, mealId, score: 3 })).toEqual({ created: true });
    expect(await repo.upsertRating({ userId, mealId, score: 4.5 })).toEqual({ created: false });
    expect(await countRows()).toBe(1);
    expect(await repo.findUserRating(userId, mealId)).toBe(4.5);
  });

  it("keeps exactly one row under concurrent upserts for the same user and meal", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => repo.upsertRating({ userId, mealId, score: (i % 5) + 1 })),
    );
    expect(await countRows()).toBe(1);
  });

  it.each([0, 5.5, 2.3, -1])("rejects invalid score %s", async (score) => {
    await expect(repo.upsertRating({ userId, mealId, score })).rejects.toBeInstanceOf(InvalidScoreError);
    expect(await countRows()).toBe(0);
  });

  it.each([0.5, 2.5, 5])("accepts valid score %s", async (score) => {
    await repo.upsertRating({ userId, mealId, score });
    expect(await repo.findUserRating(userId, mealId)).toBe(score);
  });
});

describe("ratingRepository reads", () => {
  it("findUserRating returns a number, or null when unrated", async () => {
    expect(await repo.findUserRating(userId, mealId)).toBeNull();
    await repo.upsertRating({ userId, mealId, score: 3.5 });
    expect(typeof (await repo.findUserRating(userId, mealId))).toBe("number");
  });

  it("getMealStats returns average and count, or null/0 when unrated", async () => {
    expect(await repo.getMealStats(mealId)).toEqual({ average: null, count: 0 });
    const bob = await users.createUser({ username: "bob", email: "b@example.com", password: "h" });
    await repo.upsertRating({ userId, mealId, score: 4 });
    await repo.upsertRating({ userId: bob.id, mealId, score: 3 });
    expect(await repo.getMealStats(mealId)).toEqual({ average: 3.5, count: 2 });
  });

  it("listRatingsForMeal returns id, username and score, highest first", async () => {
    const bob = await users.createUser({ username: "bob", email: "b@example.com", password: "h" });
    await repo.upsertRating({ userId, mealId, score: 2 });
    await repo.upsertRating({ userId: bob.id, mealId, score: 5 });
    expect(await repo.listRatingsForMeal(mealId)).toEqual([
      { id: expect.any(String), username: "bob", score: 5 },
      { id: expect.any(String), username: "alice", score: 2 },
    ]);
  });
});
