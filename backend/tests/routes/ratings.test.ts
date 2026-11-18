import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { TEST_DATABASE_URL } from "../helpers/testDb";
import { createApp } from "../../src/app";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

const { db, close } = createTestDb();

// The server decides the day. Fixed clock: Thursday 2026-11-12, 10:00 ET.
const DATE = "2026-11-12";
const NOW = new Date("2026-11-12T15:00:00Z");
const SECRET = "test-secret";
/** Builds an app whose clock is fixed at `now` (all apps share the one test DB). */
const appAt = (now: Date) => createApp({ db, secretKey: SECRET, now: () => now });
const app = appAt(NOW);

const meal = { hall: "Thorne", meal: "Lunch" };
let aliceToken: string;
let bobToken: string;

/** Registers a user through the API and returns their JWT. */
async function register(username: string): Promise<string> {
  const res = await request(app).post("/api/users").send({ username, email: `${username}@example.com`, password: "pw-123456" });
  return res.body.token;
}
const rate = (token: string, body: object, a = app) => request(a).post("/api/ratings").set("Authorization", `Bearer ${token}`).send(body);
const get = (token: string, path: string, a = app) => request(a).get(path).set("Authorization", `Bearer ${token}`);
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
    ["get", "/api/ratings/Thorne/Lunch/all"],
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

  it("creates the meal row for that hall/meal and the server's day", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const rows = await db.execute(sql`SELECT service_date::text AS d, hall, meal_type FROM meals`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ d: DATE, hall: "Thorne", meal_type: "Lunch" });
  });

  it("ignores a date sent by the client and uses the server's day", async () => {
    const res = await rate(aliceToken, { ...meal, rating: 4, date: "2020-01-01" });
    expect(res.status).toBe(200);
    const rows = await db.execute(sql`SELECT service_date::text AS d FROM meals`);
    expect(rows[0]).toMatchObject({ d: DATE });
  });

  it("at 10:30pm ET (already tomorrow in UTC) rates the New York day, not the UTC day", async () => {
    const lateApp = appAt(new Date("2026-11-12T03:30:00Z")); // Wed 2026-11-11, 22:30 ET
    await rate(aliceToken, { ...meal, meal: "Dinner", rating: 4 }, lateApp);
    const rows = await db.execute(sql`SELECT service_date::text AS d FROM meals`);
    expect(rows[0]).toMatchObject({ d: "2026-11-11" });
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

  // Latency: every statement is a network round trip to the database, so a rating save must stay cheap.
  // Budget: 1 statement for requireAuth's token check (tokenVersion, Step 5) + 1 for the save itself.
  it("saves a rating with exactly 2 SQL statements (auth check + one save round trip)", async () => {
    const statements: string[] = [];
    const client = postgres(TEST_DATABASE_URL);
    const countingDb = drizzle(client, { schema, logger: { logQuery: (q) => void statements.push(q) } });
    try {
      const countingApp = createApp({ db: countingDb, secretKey: SECRET, now: () => NOW });
      await rate(aliceToken, { ...meal, rating: 4 }, countingApp); // first rating of the day: creates the meal
      expect(statements.length).toBe(2);
      expect(statements[0]).toMatch(/from "users"/i); // the auth lookup comes first
      statements.length = 0;
      await rate(aliceToken, { ...meal, rating: 3.5 }, countingApp); // meal exists, rating updated
      expect(statements.length).toBe(2);
    } finally {
      await client.end();
    }
  });

  it.each(["hall", "meal", "rating"])("returns 400 when %s is missing", async (field) => {
    const res = await rate(aliceToken, { ...meal, rating: 4, [field]: undefined });
    expect(res.status).toBe(400);
  });

  it.each([0, 5.5, 2.3, -1, "abc", { $gt: 0 }])("returns 400 for invalid rating %j and saves nothing", async (rating) => {
    const res = await rate(aliceToken, { ...meal, rating });
    expect(res.status).toBe(400);
    expect(await count("ratings")).toBe(0);
  });

  // Step 3: both ends of the allowed range, and the half steps next to them, are valid.
  it.each([0.5, 1, 2.5, 4.5, 5])("accepts the score %s and echoes it back", async (rating) => {
    const res = await rate(aliceToken, { ...meal, rating });
    expect(res.status).toBe(200);
    expect(res.body.userRating).toBe(rating);
    expect(await count("ratings")).toBe(1);
  });

  // Step 3: a bad score must say what is allowed, not the generic "hall, meal, and rating required".
  it.each([0, 0.25, 5.5, 2.3, -1, "abc", null])("explains the rule when the rating %j is invalid", async (rating) => {
    const res = await rate(aliceToken, { ...meal, rating });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Rating must be between 0.5 and 5.0 in steps of 0.5");
  });

  it("keeps the generic message when the hall (not the rating) is wrong", async () => {
    const res = await rate(aliceToken, { hall: "Foo", meal: "Lunch", rating: 4 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Valid hall, meal, and rating required");
  });

  it.each([
    ["hall", "Foo"],
    ["hall", "thorne"],
    ["meal", "Snack"],
    ["meal", "lunch"],
  ])("returns 400 for unknown %s %j and creates no meal or rating", async (field, value) => {
    const res = await rate(aliceToken, { ...meal, rating: 4, [field]: value });
    expect(res.status).toBe(400);
    expect(await count("meals")).toBe(0);
    expect(await count("ratings")).toBe(0);
  });

  // Only meals the schedule serves that day can be rated (Thursday = Breakfast/Lunch/Dinner).
  it.each(["Breakfast", "Lunch", "Dinner"])("accepts weekday meal %s on either hall", async (m) => {
    expect((await rate(aliceToken, { hall: "Moulton", meal: m, rating: 3 })).status).toBe(200);
  });

  it("rejects Brunch on a weekday: 400, and no meal or rating is created", async () => {
    const res = await rate(aliceToken, { ...meal, meal: "Brunch", rating: 4 });
    expect(res.status).toBe(400);
    expect(await count("meals")).toBe(0);
    expect(await count("ratings")).toBe(0);
  });

  describe("on a weekend (Saturday 2026-11-14: Brunch + Dinner)", () => {
    const saturday = appAt(new Date("2026-11-14T15:00:00Z"));

    it.each(["Brunch", "Dinner"])("accepts %s", async (m) => {
      expect((await rate(aliceToken, { ...meal, meal: m, rating: 3 }, saturday)).status).toBe(200);
    });

    it.each(["Breakfast", "Lunch"])("rejects %s: 400, and no meal or rating is created", async (m) => {
      const res = await rate(aliceToken, { ...meal, meal: m, rating: 3 }, saturday);
      expect(res.status).toBe(400);
      expect(await count("meals")).toBe(0);
      expect(await count("ratings")).toBe(0);
    });
  });

  it("keeps ratings for other days, halls and meals separate", async () => {
    await rate(aliceToken, { ...meal, rating: 5 });
    const otherHall = await rate(aliceToken, { ...meal, hall: "Moulton", rating: 1 });
    expect(otherHall.body).toMatchObject({ avgRating: "1.00", totalRatings: 1 });
    const tomorrow = await rate(aliceToken, { ...meal, rating: 2 }, appAt(new Date("2026-11-13T15:00:00Z")));
    expect(tomorrow.body).toMatchObject({ avgRating: "2.00", totalRatings: 1, updated: false });
    expect(await count("ratings")).toBe(3);
  });

  it("creates one rating and one meal when the same user submits 10 times at once", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => rate(aliceToken, { ...meal, rating: (i % 5) + 1 })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await count("ratings")).toBe(1);
    expect(await count("meals")).toBe(1);
  });
});

describe("GET /api/ratings/user", () => {
  it("returns the caller's rating for today's meal", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const res = await get(aliceToken, "/api/ratings/user?hall=Thorne&meal=Lunch");
    expect(res.body).toEqual({ userRating: 4 });
  });

  it("returns null when the caller hasn't rated, and creates no meal row", async () => {
    const res = await get(aliceToken, "/api/ratings/user?hall=Thorne&meal=Lunch");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userRating: null });
    expect(await count("meals")).toBe(0);
  });

  it("does not return another user's rating", async () => {
    await rate(bobToken, { ...meal, rating: 5 });
    const res = await get(aliceToken, "/api/ratings/user?hall=Thorne&meal=Lunch");
    expect(res.body).toEqual({ userRating: null });
  });

  it("only looks at the server's day: yesterday's rating is not returned today", async () => {
    await rate(aliceToken, { ...meal, rating: 4 }, appAt(new Date("2026-11-11T15:00:00Z")));
    const res = await get(aliceToken, "/api/ratings/user?hall=Thorne&meal=Lunch");
    expect(res.body).toEqual({ userRating: null });
  });

  it("returns 400 when hall or meal is missing or unknown", async () => {
    for (const q of ["?hall=Thorne", "?meal=Lunch", "?hall=Foo&meal=Lunch", "?hall=Thorne&meal=Snack"]) {
      expect((await get(aliceToken, `/api/ratings/user${q}`)).status).toBe(400);
    }
  });
});

describe("GET /api/ratings/:hall/:meal/all (all of today's ratings)", () => {
  it("lists ratings highest first with _id, rating and user.username", async () => {
    await rate(aliceToken, { ...meal, rating: 2 });
    await rate(bobToken, { ...meal, rating: 5 });
    const res = await get(aliceToken, "/api/ratings/Thorne/Lunch/all");
    expect(res.status).toBe(200);
    expect(res.body.ratings).toEqual([
      { _id: expect.any(String), rating: 5, user: { username: "bob" } },
      { _id: expect.any(String), rating: 2, user: { username: "alice" } },
    ]);
  });

  it("never exposes passwords or emails", async () => {
    await rate(aliceToken, { ...meal, rating: 2 });
    const text = JSON.stringify((await get(aliceToken, "/api/ratings/Thorne/Lunch/all")).body);
    expect(text).not.toContain("password");
    expect(text).not.toContain("@");
  });

  it("returns an empty list when nothing is rated, and creates no meal row", async () => {
    const res = await get(aliceToken, "/api/ratings/Thorne/Lunch/all");
    expect(res.body).toEqual({ ratings: [] });
    expect(await count("meals")).toBe(0);
  });

  it("returns 400 for an unknown hall or meal", async () => {
    expect((await get(aliceToken, "/api/ratings/Foo/Lunch/all")).status).toBe(400);
    expect((await get(aliceToken, "/api/ratings/Thorne/Snack/all")).status).toBe(400);
  });
});

describe("GET /api/ratings/:hall/:meal (stats for today)", () => {
  it("returns the average (2 decimals) and total", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    await rate(bobToken, { ...meal, rating: 3 });
    const res = await get(aliceToken, "/api/ratings/Thorne/Lunch");
    expect(res.body).toEqual({ avgRating: "3.50", totalRatings: 2 });
  });

  it("returns avgRating 0 and totalRatings 0 when unrated, and creates no meal row", async () => {
    const res = await get(aliceToken, "/api/ratings/Thorne/Lunch");
    expect(res.body).toEqual({ avgRating: 0, totalRatings: 0 });
    expect(await count("meals")).toBe(0);
  });

  it("does not need a date query any more, and ignores one if sent", async () => {
    await rate(aliceToken, { ...meal, rating: 4 });
    const res = await get(aliceToken, "/api/ratings/Thorne/Lunch?date=2020-01-01");
    expect(res.body).toEqual({ avgRating: "4.00", totalRatings: 1 });
  });

  it("returns 400 for an unknown hall or meal", async () => {
    expect((await get(aliceToken, "/api/ratings/Foo/Lunch")).status).toBe(400);
    expect((await get(aliceToken, "/api/ratings/Thorne/Snack")).status).toBe(400);
  });
});
