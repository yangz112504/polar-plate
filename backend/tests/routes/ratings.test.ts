import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import { createApp } from "../../src/app";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

const { db, close } = createTestDb();
const app = createApp({ db, secretKey: "test-secret" });

const DATE = "2026-11-12";
const meal = { hall: "Thorne", meal: "Lunch", date: DATE };
let aliceToken: string;
let bobToken: string;

/** Registers a user through the API and returns their JWT. */
async function register(username: string): Promise<string> {
  const res = await request(app).post("/api/users").send({ username, email: `${username}@example.com`, password: "pw-123456" });
  return res.body.token;
}
const rate = (token: string, body: object) => request(app).post("/api/ratings").set("Authorization", `Bearer ${token}`).send(body);
const get = (token: string, path: string) => request(app).get(path).set("Authorization", `Bearer ${token}`);
const count = async (table: "ratings" | "meals") =>
  (await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`)))[0].n;

beforeEach(async () => {
  await resetDb(db);
  aliceToken = await register("alice");
  bobToken = await register("bob");
});
afterAll(() => close());

describe("authentication on rating routes", () => {
  it.each([
    ["post", "/api/ratings"],
    ["get", "/api/ratings/user"],
    ["get", "/api/ratings/Thorne/Lunch/2026-11-12"],
    ["get", "/api/ratings/Thorne/Lunch"],
  ] as const)("%s %s returns 401 without a token and 403 with a bad one", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
    expect((await request(app)[method](path).set("Authorization", "Bearer bad")).status).toBe(403);
  });
});

describe("POST /api/ratings", () => {
  it("saves a new rating and returns the average, count and updated:false", async () => {
    const res = await rate(aliceToken, { ...meal, rating: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Rating saved", avgRating: "4.00", totalRatings: 1, updated: false, userRating: 4 });
    expect(await count("ratings")).toBe(1);
  });

  it("creates the meal row for that hall/meal/date", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const rows = await db.execute(sql`SELECT service_date::text AS d, hall, meal_type FROM meals`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ d: DATE, hall: "Thorne", meal_type: "Lunch" });
  });

  it("updates when the same user rates again (updated:true, still one row)", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const res = await rate(aliceToken, { ...meal, rating: 2 });
    expect(res.body).toMatchObject({ updated: true, avgRating: "2.00", totalRatings: 1, userRating: 2 });
    expect(await count("ratings")).toBe(1);
  });

  it("averages across users", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const res = await rate(bobToken, { ...meal, rating: 3 });
    expect(res.body).toMatchObject({ avgRating: "3.50", totalRatings: 2 });
  });

  it("accepts a half-star score", async () => {
    const res = await rate(aliceToken, { ...meal, rating: 4.5 });
    expect(res.status).toBe(200);
    expect(res.body.avgRating).toBe("4.50");
  });

  it.each(["hall", "meal", "rating", "date"])("returns 400 when %s is missing", async (field) => {
    const res = await rate(aliceToken, { ...meal, rating: 4, [field]: undefined });
    expect(res.status).toBe(400);
  });

  it.each([0, 5.5, 2.3, -1, "abc", { $gt: 0 }])("returns 400 for invalid rating %j and saves nothing", async (rating) => {
    const res = await rate(aliceToken, { ...meal, rating });
    expect(res.status).toBe(400);
    expect(await count("ratings")).toBe(0);
  });

  it.each(["tomorrow", "2026-13-45", "11/12/2026"])("returns 400 for invalid date %s", async (date) => {
    expect((await rate(aliceToken, { ...meal, rating: 4, date })).status).toBe(400);
  });

  it("keeps ratings for other dates, halls and meals separate", async () => {
    await rate(aliceToken, { ...meal, rating: 5 });
    const other = await rate(aliceToken, { ...meal, hall: "Moulton", rating: 1 });
    expect(other.body).toMatchObject({ avgRating: "1.00", totalRatings: 1 });
    expect(await count("ratings")).toBe(2);
  });

  it("creates one rating and one meal when the same user submits 10 times at once", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => rate(aliceToken, { ...meal, rating: (i % 5) + 1 })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await count("ratings")).toBe(1);
    expect(await count("meals")).toBe(1);
  });
});

describe("GET /api/ratings/user", () => {
  it("returns the caller's rating", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const res = await get(aliceToken, `/api/ratings/user?hall=Thorne&meal=Lunch&date=${DATE}`);
    expect(res.body).toEqual({ userRating: 4 });
  });

  it("returns null when the caller hasn't rated, and creates no meal row", async () => {
    const res = await get(aliceToken, `/api/ratings/user?hall=Thorne&meal=Lunch&date=${DATE}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userRating: null });
    expect(await count("meals")).toBe(0);
  });

  it("does not return another user's rating", async () => {
    await rate(bobToken, { ...meal, rating: 5 });
    const res = await get(aliceToken, `/api/ratings/user?hall=Thorne&meal=Lunch&date=${DATE}`);
    expect(res.body).toEqual({ userRating: null });
  });

  it("returns 400 when hall, meal or date is missing", async () => {
    const res = await get(aliceToken, "/api/ratings/user?hall=Thorne&meal=Lunch");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Hall, meal, and date required");
  });
});

describe("GET /api/ratings/:hall/:meal/:date (all ratings)", () => {
  it("lists ratings highest first with _id, rating and user.username", async () => {
    await rate(aliceToken, { ...meal, rating: 2 });
    await rate(bobToken, { ...meal, rating: 5 });
    const res = await get(aliceToken, `/api/ratings/Thorne/Lunch/${DATE}`);
    expect(res.status).toBe(200);
    expect(res.body.ratings).toEqual([
      { _id: expect.any(String), rating: 5, user: { username: "bob" } },
      { _id: expect.any(String), rating: 2, user: { username: "alice" } },
    ]);
  });

  it("never exposes passwords or emails", async () => {
    await rate(aliceToken, { ...meal, rating: 2 });
    const text = JSON.stringify((await get(aliceToken, `/api/ratings/Thorne/Lunch/${DATE}`)).body);
    expect(text).not.toContain("password");
    expect(text).not.toContain("@");
  });

  it("returns an empty list when nothing is rated, and creates no meal row", async () => {
    const res = await get(aliceToken, `/api/ratings/Thorne/Lunch/${DATE}`);
    expect(res.body).toEqual({ ratings: [] });
    expect(await count("meals")).toBe(0);
  });
});

describe("GET /api/ratings/:hall/:meal?date= (stats)", () => {
  it("returns the average (2 decimals) and total", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    await rate(bobToken, { ...meal, rating: 3 });
    const res = await get(aliceToken, `/api/ratings/Thorne/Lunch?date=${DATE}`);
    expect(res.body).toEqual({ avgRating: "3.50", totalRatings: 2 });
  });

  it("returns avgRating 0 and totalRatings 0 when unrated, and creates no meal row", async () => {
    const res = await get(aliceToken, `/api/ratings/Thorne/Lunch?date=${DATE}`);
    expect(res.body).toEqual({ avgRating: 0, totalRatings: 0 });
    expect(await count("meals")).toBe(0);
  });
});
