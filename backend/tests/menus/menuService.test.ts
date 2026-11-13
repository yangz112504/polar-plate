import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMealRepository } from "../../src/meals/mealRepository";
import { MenuFetchError, MenuFormatError } from "../../src/menus/errors";
import { createMenuService } from "../../src/menus/menuService";
import type { MenuCategory } from "../../src/db/schema";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

const { db, close } = createTestDb();
const meals = createMealRepository(db);

const DATE = "2026-11-12";
const thorne: MenuCategory[] = [{ category: "Soup", items: ["Tomato"] }];
const moulton: MenuCategory[] = [{ category: "Main Course", items: ["Pasta"] }];

/** Fake Bowdoin: resolves per hall after a short delay so concurrent calls overlap. */
function fakeFetch(results: Record<string, MenuCategory[] | Error> = { Thorne: thorne, Moulton: moulton }) {
  return vi.fn(async (_date: string, hall: string) => {
    await new Promise((r) => setTimeout(r, 20));
    const r = results[hall];
    if (r instanceof Error) throw r;
    return r;
  });
}

beforeEach(() => resetDb(db));
afterAll(() => close());

describe("menuService.getMenus: cache-aside", () => {
  it("fetches both halls on a miss, returns them, and stores them", async () => {
    const fetchMenu = fakeFetch();
    const service = createMenuService({ meals, fetchMenu });
    expect(await service.getMenus(DATE, "Lunch")).toEqual({ Thorne: thorne, Moulton: moulton });
    expect(fetchMenu).toHaveBeenCalledTimes(2);
    expect((await meals.findMeal(DATE, "Thorne", "Lunch"))?.items).toEqual(thorne);
  });

  it("does not call Bowdoin again once both menus are stored", async () => {
    const fetchMenu = fakeFetch();
    const service = createMenuService({ meals, fetchMenu });
    await service.getMenus(DATE, "Lunch");
    expect(await service.getMenus(DATE, "Lunch")).toEqual({ Thorne: thorne, Moulton: moulton });
    expect(fetchMenu).toHaveBeenCalledTimes(2); // still just the first two calls
  });

  it("fetches only the hall that isn't stored yet", async () => {
    await meals.setMenuItems(DATE, "Thorne", "Lunch", thorne);
    const fetchMenu = fakeFetch();
    await createMenuService({ meals, fetchMenu }).getMenus(DATE, "Lunch");
    expect(fetchMenu).toHaveBeenCalledTimes(1);
    expect(fetchMenu).toHaveBeenCalledWith(DATE, "Moulton", "Lunch");
  });

  it("keeps different meal types and dates separate", async () => {
    const fetchMenu = fakeFetch();
    const service = createMenuService({ meals, fetchMenu });
    await service.getMenus(DATE, "Lunch");
    await service.getMenus(DATE, "Dinner");
    await service.getMenus("2026-11-13", "Lunch");
    expect(fetchMenu).toHaveBeenCalledTimes(6);
  });

  it("works when a rating already created the meal row with no menu yet", async () => {
    await meals.getOrCreateMeal(DATE, "Thorne", "Lunch"); // items null
    const service = createMenuService({ meals, fetchMenu: fakeFetch() });
    expect((await service.getMenus(DATE, "Lunch")).Thorne).toEqual(thorne);
  });
});

describe("menuService.getMenus: empty and failed fetches", () => {
  it("returns [] for a hall with no menu, stores nothing, and asks Bowdoin again next time", async () => {
    const fetchMenu = fakeFetch({ Thorne: [], Moulton: moulton });
    const service = createMenuService({ meals, fetchMenu });
    expect((await service.getMenus(DATE, "Lunch")).Thorne).toEqual([]);
    expect((await meals.findMeal(DATE, "Thorne", "Lunch"))?.items ?? null).toBeNull();
    await service.getMenus(DATE, "Lunch");
    expect(fetchMenu).toHaveBeenCalledWith(DATE, "Thorne", "Lunch");
    expect(fetchMenu.mock.calls.filter((c) => c[1] === "Thorne")).toHaveLength(2); // retried; Moulton was cached
    expect(fetchMenu.mock.calls.filter((c) => c[1] === "Moulton")).toHaveLength(1);
  });

  it("returns the working hall plus an error for the failed hall, saving only the working one", async () => {
    const fetchMenu = fakeFetch({ Thorne: thorne, Moulton: new MenuFetchError("down") });
    const result = await createMenuService({ meals, fetchMenu }).getMenus(DATE, "Lunch");
    expect(result).toEqual({ Thorne: thorne, Moulton: [], errors: { Moulton: "unreachable" } });
    expect((await meals.findMeal(DATE, "Thorne", "Lunch"))?.items).toEqual(thorne);
    expect((await meals.findMeal(DATE, "Moulton", "Lunch"))?.items ?? null).toBeNull();
  });

  it("reports 'format_changed' when Bowdoin's JSON has an unexpected shape", async () => {
    const fetchMenu = fakeFetch({ Thorne: new MenuFormatError("bad"), Moulton: moulton });
    const result = await createMenuService({ meals, fetchMenu }).getMenus(DATE, "Lunch");
    expect(result.errors).toEqual({ Thorne: "format_changed" });
    expect(result.Moulton).toEqual(moulton);
  });

  it("has no `errors` key when everything worked", async () => {
    const result = await createMenuService({ meals, fetchMenu: fakeFetch() }).getMenus(DATE, "Lunch");
    expect(result).not.toHaveProperty("errors");
  });

  it("still throws for unexpected errors (not a Bowdoin failure), so they become a 500", async () => {
    const fetchMenu = fakeFetch({ Thorne: new TypeError("bug"), Moulton: moulton });
    await expect(createMenuService({ meals, fetchMenu }).getMenus(DATE, "Lunch")).rejects.toBeInstanceOf(TypeError);
  });

  it("on the next request, retries only the hall that failed", async () => {
    const results: Record<string, MenuCategory[] | Error> = { Thorne: new MenuFetchError("down"), Moulton: moulton };
    const fetchMenu = fakeFetch(results);
    const service = createMenuService({ meals, fetchMenu });
    expect((await service.getMenus(DATE, "Lunch")).errors).toEqual({ Thorne: "unreachable" });
    results.Thorne = thorne; // Bowdoin recovers
    expect(await service.getMenus(DATE, "Lunch")).toEqual({ Thorne: thorne, Moulton: moulton });
    expect(fetchMenu.mock.calls.filter((c) => c[1] === "Moulton")).toHaveLength(1); // Moulton stayed cached
    expect(fetchMenu.mock.calls.filter((c) => c[1] === "Thorne")).toHaveLength(2);
  });
});

describe("menuService.getMenus: single-flight", () => {
  it("calls Bowdoin once per hall when 10 requests arrive together, and all get the result", async () => {
    const fetchMenu = fakeFetch();
    const service = createMenuService({ meals, fetchMenu });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.getMenus(DATE, "Lunch")));
    expect(fetchMenu).toHaveBeenCalledTimes(2);
    for (const r of results) expect(r).toEqual({ Thorne: thorne, Moulton: moulton });
  });

  it("shares one failure: 10 simultaneous requests cause one attempt per hall and all 10 see the same errors", async () => {
    const fetchMenu = fakeFetch({ Thorne: new MenuFetchError("down"), Moulton: new MenuFetchError("down") });
    const service = createMenuService({ meals, fetchMenu });
    const results = await Promise.all(Array.from({ length: 10 }, () => service.getMenus(DATE, "Lunch")));
    expect(fetchMenu).toHaveBeenCalledTimes(2);
    for (const r of results) expect(r.errors).toEqual({ Thorne: "unreachable", Moulton: "unreachable" });
  });

  it("forgets a finished fetch, so a later request starts a new one", async () => {
    const fetchMenu = fakeFetch({ Thorne: [], Moulton: [] });
    const service = createMenuService({ meals, fetchMenu });
    await service.getMenus(DATE, "Lunch");
    await service.getMenus(DATE, "Lunch");
    expect(fetchMenu).toHaveBeenCalledTimes(4);
  });

  it("does not merge requests for different meals", async () => {
    const fetchMenu = fakeFetch();
    const service = createMenuService({ meals, fetchMenu });
    await Promise.all([service.getMenus(DATE, "Lunch"), service.getMenus(DATE, "Dinner")]);
    expect(fetchMenu).toHaveBeenCalledTimes(4);
  });
});
