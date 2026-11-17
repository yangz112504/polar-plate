import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { insertMeal } from "../helpers/insertMeal";
import { createMealRepository } from "../../src/meals/mealRepository";

const { db, close } = createTestDb();
const repo = createMealRepository(db);

beforeEach(() => resetDb(db));
afterAll(() => close());

describe("mealRepository.findMeal", () => {
  it("returns null and creates nothing when the meal does not exist", async () => {
    expect(await repo.findMeal("2026-11-12", "Thorne", "Lunch")).toBeNull();
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM meals`);
    expect(rows[0].n).toBe(0);
  });

  it("returns the meal when it exists", async () => {
    const id = await insertMeal(db, "2026-11-12", "Thorne", "Lunch");
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.id).toBe(id);
  });
});

describe("mealRepository menu items", () => {
  const soup = [{ category: "Soup", items: ["Tomato"] }];

  it("a meal row without a stored menu has items null", async () => {
    await insertMeal(db, "2026-11-12", "Thorne", "Lunch");
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.items).toBeNull();
  });

  it("setMenuItems stores the menu and findMeal returns it", async () => {
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.items).toEqual(soup);
  });

  it("setMenuItems fills a meal row that a rating already created, keeping its id", async () => {
    const id = await insertMeal(db, "2026-11-12", "Thorne", "Lunch");
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.id).toBe(id);
  });

  it("setMenuItems called twice leaves one row with the latest menu", async () => {
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", [{ category: "Deli", items: ["Ham"] }]);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM meals`);
    expect(rows[0].n).toBe(1);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.items).toEqual([{ category: "Deli", items: ["Ham"] }]);
  });
});
