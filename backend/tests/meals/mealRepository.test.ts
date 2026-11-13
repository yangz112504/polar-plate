import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { createMealRepository } from "../../src/meals/mealRepository";

const { db, close } = createTestDb();
const repo = createMealRepository(db);

beforeEach(() => resetDb(db));
afterAll(() => close());

describe("mealRepository.getOrCreateMeal", () => {
  it("creates the meal the first time and returns the same id the second time", async () => {
    const first = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch");
    const second = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch");
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({ serviceDate: "2026-11-12", hall: "Thorne", mealType: "Lunch" });
  });

  it("treats a different hall, type or date as a different meal", async () => {
    const a = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch");
    const b = await repo.getOrCreateMeal("2026-11-12", "Moulton", "Lunch");
    const c = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Dinner");
    const d = await repo.getOrCreateMeal("2026-11-13", "Thorne", "Lunch");
    expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(4);
  });

  it("creates exactly one row under concurrent calls for the same key", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch")),
    );
    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM meals`);
    expect(rows[0].n).toBe(1);
  });
});

describe("mealRepository.findMeal", () => {
  it("returns null and creates nothing when the meal does not exist", async () => {
    expect(await repo.findMeal("2026-11-12", "Thorne", "Lunch")).toBeNull();
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM meals`);
    expect(rows[0].n).toBe(0);
  });

  it("returns the meal when it exists", async () => {
    const created = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch");
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.id).toBe(created.id);
  });
});

describe("mealRepository menu items", () => {
  const soup = [{ category: "Soup", items: ["Tomato"] }];

  it("a new meal has items null", async () => {
    expect((await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch")).items).toBeNull();
  });

  it("setMenuItems stores the menu and findMeal returns it", async () => {
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.items).toEqual(soup);
  });

  it("setMenuItems fills a meal row that a rating already created, keeping its id", async () => {
    const created = await repo.getOrCreateMeal("2026-11-12", "Thorne", "Lunch");
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.id).toBe(created.id);
  });

  it("setMenuItems called twice leaves one row with the latest menu", async () => {
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", soup);
    await repo.setMenuItems("2026-11-12", "Thorne", "Lunch", [{ category: "Deli", items: ["Ham"] }]);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM meals`);
    expect(rows[0].n).toBe(1);
    expect((await repo.findMeal("2026-11-12", "Thorne", "Lunch"))?.items).toEqual([{ category: "Deli", items: ["Ham"] }]);
  });
});
