import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import type { DayMenu, MenuService } from "../../src/menus/menuService";
import { createTestDb } from "../helpers/testDb";

const { db, close } = createTestDb();
afterAll(() => close());

const menus = {
  Thorne: [{ category: "Soup", items: ["Tomato"] }],
  Moulton: [{ category: "Main Course", items: ["Pasta"] }],
};

/** Builds an app whose menu service is a fake, with the clock fixed. */
function appWith(getMenus: MenuService["getMenus"], now = new Date("2026-11-12T15:00:00Z")) {
  const menuService = { getMenus: vi.fn(getMenus) };
  return { app: createApp({ db, secretKey: "s", menuService, now: () => now }), menuService };
}

describe("GET /api/menus/schedule", () => {
  it("returns the server's date, the tabs and the default tab (Thursday 10:00 ET -> Lunch)", async () => {
    const { app } = appWith(async () => menus);
    const res = await request(app).get("/api/menus/schedule");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: "2026-11-12", meals: ["Breakfast", "Lunch", "Dinner"], defaultMeal: "Lunch" });
  });

  it("returns Brunch + Dinner on a weekend", async () => {
    const { app } = appWith(async () => menus, new Date("2026-11-14T15:00:00Z"));
    const res = await request(app).get("/api/menus/schedule");
    expect(res.body).toEqual({ date: "2026-11-14", meals: ["Brunch", "Dinner"], defaultMeal: "Brunch" });
  });

  it("is not captured by /:meal: no 'Invalid meal parameter' and the menu service is not called", async () => {
    const { app, menuService } = appWith(async () => menus);
    const res = await request(app).get("/api/menus/schedule");
    expect(res.body.error).toBeUndefined();
    expect(menuService.getMenus).not.toHaveBeenCalled();
  });

  it("needs no login", async () => {
    const { app } = appWith(async () => menus);
    expect((await request(app).get("/api/menus/schedule")).status).toBe(200);
  });
});

describe("GET /api/menus/:meal", () => {
  it("returns both halls as [{category, items}] (the shape the frontend already uses)", async () => {
    const { app } = appWith(async () => menus);
    const res = await request(app).get("/api/menus/Lunch");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(menus);
  });

  it("needs no login (the dashboard fetches it without a token)", async () => {
    const { app } = appWith(async () => menus);
    expect((await request(app).get("/api/menus/Lunch")).status).toBe(200);
  });

  it("uses the server's New York day, not UTC: 10:30pm ET on Nov 11 asks for 2026-11-11", async () => {
    const { app, menuService } = appWith(async () => menus, new Date("2026-11-12T03:30:00Z"));
    await request(app).get("/api/menus/Dinner");
    expect(menuService.getMenus).toHaveBeenCalledWith("2026-11-11", "Dinner");
  });

  it.each(["Breakfast", "Brunch", "Lunch", "Dinner"])("accepts %s", async (meal) => {
    const { app } = appWith(async () => menus);
    expect((await request(app).get(`/api/menus/${meal}`)).status).toBe(200);
  });

  it("returns 400 'Invalid meal parameter' for an unknown meal without calling the service", async () => {
    const { app, menuService } = appWith(async () => menus);
    const res = await request(app).get("/api/menus/Snack");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid meal parameter" });
    expect(menuService.getMenus).not.toHaveBeenCalled();
  });

  it("returns 200 with empty lists when Bowdoin has no menu ('No menu found')", async () => {
    const { app } = appWith(async () => ({ Thorne: [], Moulton: [] }));
    const res = await request(app).get("/api/menus/Brunch");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ Thorne: [], Moulton: [] });
  });

  it("returns 200 with the working hall and a per-hall error reason when one hall fails", async () => {
    const body: DayMenu = { Thorne: menus.Thorne, Moulton: [], errors: { Moulton: "unreachable" } };
    const { app } = appWith(async () => body);
    const res = await request(app).get("/api/menus/Lunch");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
  });

  it("returns 502 'Error fetching menus' with each hall's reason when both halls fail", async () => {
    const errors: DayMenu["errors"] = { Thorne: "unreachable", Moulton: "format_changed" };
    const { app } = appWith(async () => ({ Thorne: [], Moulton: [], errors }));
    const res = await request(app).get("/api/menus/Lunch");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Error fetching menus", errors });
  });

  it("returns a generic 500 for unexpected errors without leaking details", async () => {
    const { app } = appWith(async () => {
      throw new Error("secret internal detail");
    });
    const res = await request(app).get("/api/menus/Lunch");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
