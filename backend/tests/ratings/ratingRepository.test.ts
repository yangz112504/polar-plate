import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { createUserRepository } from "../../src/users/userRepository";
import { createMealRepository } from "../../src/meals/mealRepository";
import { insertMeal } from "../helpers/insertMeal";
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
  mealId = await insertMeal(db, "2026-11-12", "Thorne", "Lunch");
});
afterAll(() => close());

/** Fixture: saves a rating for the Thorne Lunch meal created in beforeEach. */
const rateFixture = (uid: string, score: number) =>
  repo.rateMeal({ userId: uid, serviceDate: "2026-11-12", hall: "Thorne", mealType: "Lunch", score });

const countRows = async () => (await db.execute(sql`SELECT count(*)::int AS n FROM ratings`))[0].n;

describe("ratingRepository reads", () => {
  it("findUserRating returns a number, or null when unrated", async () => {
    expect(await repo.findUserRating(userId, mealId)).toBeNull();
    await rateFixture(userId, 3.5);
    expect(typeof (await repo.findUserRating(userId, mealId))).toBe("number");
  });

  it("getMealStats returns average and count, or null/0 when unrated", async () => {
    expect(await repo.getMealStats(mealId)).toEqual({ average: null, count: 0 });
    const bob = await users.createUser({ username: "bob", email: "b@example.com", password: "h" });
    await rateFixture(userId, 4);
    await rateFixture(bob.id, 3);
    expect(await repo.getMealStats(mealId)).toEqual({ average: 3.5, count: 2 });
  });

  it("listRatingsForMeal returns id, username and score, highest first", async () => {
    const bob = await users.createUser({ username: "bob", email: "b@example.com", password: "h" });
    await rateFixture(userId, 2);
    await rateFixture(bob.id, 5);
    expect(await repo.listRatingsForMeal(mealId)).toEqual([
      { id: expect.any(String), username: "bob", score: 5 },
      { id: expect.any(String), username: "alice", score: 2 },
    ]);
  });
});

describe("ratingRepository.rateMeal (meal + rating in one statement)", () => {
  const key = { serviceDate: "2026-11-12", hall: "Moulton", mealType: "Dinner" };
  const mealCount = async (): Promise<number> => Number((await db.execute(sql`SELECT count(*)::int AS n FROM meals`))[0].n);

  it("creates the meal and the rating when neither exists", async () => {
    const result = await repo.rateMeal({ userId, ...key, score: 3.5 });
    expect(result.created).toBe(true);
    expect(await repo.findUserRating(userId, result.mealId)).toBe(3.5);
    const [row] = await db.execute(sql`SELECT items FROM meals WHERE id = ${result.mealId}`);
    expect(row.items).toBeNull();
    expect(await mealCount()).toBe(2); // the one from beforeEach plus this one
  });

  it("reuses an existing meal: same id, stored menu untouched, no extra meal row", async () => {
    const items = [{ category: "Soup", items: ["Tomato"] }];
    await meals.setMenuItems(key.serviceDate, key.hall, key.mealType, items);
    const existing = await meals.findMeal(key.serviceDate, key.hall, key.mealType);
    const before = await mealCount();

    const result = await repo.rateMeal({ userId, ...key, score: 4 });

    expect(result.mealId).toBe(existing!.id);
    expect((await meals.findMeal(key.serviceDate, key.hall, key.mealType))!.items).toEqual(items);
    expect(await mealCount()).toBe(before);
  });

  it.each([0.5, 2.5, 5])("accepts valid score %s", async (score) => {
    const { mealId: id } = await repo.rateMeal({ userId, ...key, score });
    expect(await repo.findUserRating(userId, id)).toBe(score);
  });

  it("a second call by the same user updates the score and keeps one rating row", async () => {
    const first = await repo.rateMeal({ userId, ...key, score: 3 });
    const second = await repo.rateMeal({ userId, ...key, score: 4.5 });
    expect(second).toMatchObject({ mealId: first.mealId, created: false });
    expect(await repo.findUserRating(userId, first.mealId)).toBe(4.5);
    expect(await countRows()).toBe(1);
  });

  it.each([0, 5.5, 2.3, -1])("rejects score %s and creates neither a meal nor a rating", async (score) => {
    const before = await mealCount();
    await expect(repo.rateMeal({ userId, ...key, score })).rejects.toBeInstanceOf(InvalidScoreError);
    expect(await mealCount()).toBe(before);
    expect(await countRows()).toBe(0);
  });

  it("10 concurrent calls by one user for a new meal leave one meal row and one rating row", async () => {
    const before = await mealCount();
    await Promise.all(Array.from({ length: 10 }, (_, i) => repo.rateMeal({ userId, ...key, score: (i % 5) + 1 })));
    expect(await mealCount()).toBe(before + 1);
    expect(await countRows()).toBe(1);
  });

  it("10 different users rating the same new meal at once leave one meal row and 10 rating rows", async () => {
    const before = await mealCount();
    const ids = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => (await users.createUser({ username: `u${i}`, email: `u${i}@example.com`, password: "h" })).id),
    );
    const results = await Promise.all(ids.map((id) => repo.rateMeal({ userId: id, ...key, score: 4 })));
    expect(new Set(results.map((r) => r.mealId)).size).toBe(1);
    expect(await mealCount()).toBe(before + 1);
    expect(await countRows()).toBe(10);
  });

  // Stats come back in the same statement (one round trip), so they must match what getMealStats would say.
  describe("returned stats (average and count including the rating just saved)", () => {
    const bobId = async () => (await users.createUser({ username: "bob", email: "b@example.com", password: "h" })).id;

    it("a first rating is its own average", async () => {
      const r = await repo.rateMeal({ userId, ...key, score: 4 });
      expect(r).toMatchObject({ average: 4, count: 1 });
    });

    it("averages across users", async () => {
      await repo.rateMeal({ userId, ...key, score: 4 });
      const r = await repo.rateMeal({ userId: await bobId(), ...key, score: 3 });
      expect(r).toMatchObject({ average: 3.5, count: 2 });
    });

    it("re-rating replaces the user's own score instead of adding a second one", async () => {
      const bob = await bobId();
      await repo.rateMeal({ userId, ...key, score: 4 });
      await repo.rateMeal({ userId: bob, ...key, score: 3 });
      const r = await repo.rateMeal({ userId, ...key, score: 5 }); // alice 4 -> 5
      expect(r).toMatchObject({ average: 4, count: 2 });
    });

    it("handles half steps and a non-terminating average (4, 4.5, 2.5 -> 3.6666...)", async () => {
      await repo.rateMeal({ userId, ...key, score: 4 });
      await repo.rateMeal({ userId: await bobId(), ...key, score: 4.5 });
      const carol = (await users.createUser({ username: "carol", email: "c@example.com", password: "h" })).id;
      const r = await repo.rateMeal({ userId: carol, ...key, score: 2.5 });
      expect(r.count).toBe(3);
      expect(r.average).toBeCloseTo(11 / 3, 10);
    });

    it("equals getMealStats read afterwards", async () => {
      await repo.rateMeal({ userId, ...key, score: 4 });
      const r = await repo.rateMeal({ userId: await bobId(), ...key, score: 2 });
      const stats = await repo.getMealStats(r.mealId);
      expect(r.average).toBeCloseTo(stats.average!, 10);
      expect(r.count).toBe(stats.count);
    });

    it("only counts ratings for this meal, not other meals", async () => {
      await rateFixture(userId, 1); // Thorne Lunch, a different meal
      const r = await repo.rateMeal({ userId, ...key, score: 5 });
      expect(r).toMatchObject({ average: 5, count: 1 });
    });
  });
});
