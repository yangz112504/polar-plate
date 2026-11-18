import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import { createUserRepository } from "../../src/users/userRepository";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

// Step 5, slice 2: change username and password.
const SECRET = "test-secret";
const { db, close } = createTestDb();
const users = createUserRepository(db);
const alice = { username: "alice", email: "alice@example.com", password: "pw-alice-123" };
const bob = { username: "bob", email: "bob@example.com", password: "pw-bob-12345" };

// A fresh app per test gives each test its own rate-limit counters.
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  await resetDb(db);
  app = createApp({ db, secretKey: SECRET });
});
afterAll(() => close());

/** Registers a user through the API and returns their token. */
async function register(u: typeof alice): Promise<string> {
  return (await request(app).post("/api/users").send(u)).body.token;
}
const rename = (token: string, body: object) =>
  request(app).patch("/api/users/me").set("Authorization", `Bearer ${token}`).send(body);
const changePassword = (token: string, body: object) =>
  request(app).put("/api/users/me/password").set("Authorization", `Bearer ${token}`).send(body);

describe("PATCH /api/users/me (change username)", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).patch("/api/users/me").send({ username: "x1x" })).status).toBe(401);
  });

  it("renames the user and returns the updated user without any password field", async () => {
    const token = await register(alice);
    const res = await rename(token, { username: "alicia" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "alicia", email: "alice@example.com" });
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect((await users.findUserByUsername("alicia"))?.email).toBe("alice@example.com");
  });

  it("the same token keeps working and GET /me shows the new name", async () => {
    const token = await register(alice);
    await rename(token, { username: "alicia" });
    const me = await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("alicia");
  });

  it("the user can log in with the new name and no longer with the old one", async () => {
    const token = await register(alice);
    await rename(token, { username: "alicia" });
    expect((await request(app).post("/api/sessions").send({ username: "alicia", password: alice.password })).status).toBe(200);
    expect((await request(app).post("/api/sessions").send({ username: "alice", password: alice.password })).status).toBe(401);
  });

  it("returns 200 when 'renaming' to the user's own current name", async () => {
    const token = await register(alice);
    expect((await rename(token, { username: "alice" })).status).toBe(200);
  });

  it("returns 409 'Username already taken' when another user has the name", async () => {
    const token = await register(alice);
    await register(bob);
    const res = await rename(token, { username: "bob" });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Username already taken");
    expect((await users.findUserByUsername("alice"))).not.toBeNull(); // unchanged
  });

  it.each([
    ["missing", {}],
    ["not a string (operator object)", { username: { $ne: null } }],
    ["empty", { username: "" }],
    ["too short (2 chars)", { username: "ab" }],
    ["too long (21 chars)", { username: "a".repeat(21) }],
    ["has a space", { username: "al ice" }],
    ["has punctuation other than _ and -", { username: "al!ce" }],
  ])("returns 400 when the username is %s", async (_name, body) => {
    const token = await register(alice);
    const res = await rename(token, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username/i);
    expect((await users.findUserByUsername("alice"))).not.toBeNull(); // unchanged
  });

  it.each(["abc", "a".repeat(20), "al_ice-9", "Alice2"])("accepts the valid username %s", async (name) => {
    const token = await register(alice);
    expect((await rename(token, { username: name })).status).toBe(200);
  });
});

describe("PUT /api/users/me/password (change password)", () => {
  const good = { currentPassword: alice.password, newPassword: "a-brand-new-pw-1" };

  it("returns 401 without a token", async () => {
    expect((await request(app).put("/api/users/me/password").send(good)).status).toBe(401);
  });

  it("changes the password: the new one logs in, the old one does not", async () => {
    const token = await register(alice);
    expect((await changePassword(token, good)).status).toBe(200);
    expect((await request(app).post("/api/sessions").send({ username: "alice", password: good.newPassword })).status).toBe(200);
    expect((await request(app).post("/api/sessions").send({ username: "alice", password: alice.password })).status).toBe(401);
  });

  it("stores a bcrypt hash, never the plaintext", async () => {
    const token = await register(alice);
    await changePassword(token, good);
    const stored = (await users.findUserByUsername("alice"))!;
    expect(stored.password).not.toBe(good.newPassword);
    expect(await bcrypt.compare(good.newPassword, stored.password)).toBe(true);
  });

  it("revokes the old token and returns a fresh one that works", async () => {
    const oldToken = await register(alice);
    const res = await changePassword(oldToken, good);
    expect(res.body.token).toEqual(expect.any(String));
    expect(jwt.verify(res.body.token, SECRET)).toMatchObject({ username: "alice", tokenVersion: 1 });
    const get = (t: string) => request(app).get("/api/users/me").set("Authorization", `Bearer ${t}`);
    expect((await get(oldToken)).status).toBe(403);
    expect((await get(res.body.token)).status).toBe(200);
  });

  it("returns 400 'Current password is incorrect' for a wrong current password, and changes nothing", async () => {
    const token = await register(alice);
    const res = await changePassword(token, { ...good, currentPassword: "not-my-password" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Current password is incorrect");
    expect((await request(app).post("/api/sessions").send({ username: "alice", password: alice.password })).status).toBe(200);
    expect((await users.findUserByUsername("alice"))!.tokenVersion).toBe(0);
  });

  it("returns 400 when the new password equals the current one", async () => {
    const token = await register(alice);
    const res = await changePassword(token, { currentPassword: alice.password, newPassword: alice.password });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("New password must be different from the current one");
  });

  it.each([
    ["currentPassword is missing", { newPassword: "a-brand-new-pw-1" }],
    ["newPassword is missing", { currentPassword: alice.password }],
    ["a field is not a string", { currentPassword: alice.password, newPassword: { $ne: null } }],
    ["newPassword is shorter than 8 characters", { currentPassword: alice.password, newPassword: "short7!" }],
    // bcrypt only uses the first 72 bytes, so a longer password would silently be cut off.
    ["newPassword is longer than 72 characters", { currentPassword: alice.password, newPassword: "x".repeat(73) }],
  ])("returns 400 when %s", async (_name, body) => {
    const token = await register(alice);
    expect((await changePassword(token, body)).status).toBe(400);
    expect((await users.findUserByUsername("alice"))!.tokenVersion).toBe(0);
  });

  it("accepts a new password of exactly 8 and exactly 72 characters", async () => {
    let token = await register(alice);
    const r1 = await changePassword(token, { currentPassword: alice.password, newPassword: "12345678" });
    expect(r1.status).toBe(200);
    token = r1.body.token;
    expect((await changePassword(token, { currentPassword: "12345678", newPassword: "y".repeat(72) })).status).toBe(200);
  });

  // Rate limit: someone holding a stolen token could otherwise guess the current password endlessly.
  it("answers 429 after 5 failed attempts, even if the 6th has the right current password", async () => {
    const token = await register(alice);
    for (let i = 0; i < 5; i++) {
      expect((await changePassword(token, { ...good, currentPassword: `wrong-guess-${i}` })).status).toBe(400);
    }
    expect((await changePassword(token, good)).status).toBe(429);
  });

  it("counts attempts per user, so one user's failures do not lock out another", async () => {
    const aliceToken = await register(alice);
    const bobToken = await register(bob);
    for (let i = 0; i < 5; i++) await changePassword(aliceToken, { ...good, currentPassword: `wrong-${i}` });
    const res = await changePassword(bobToken, { currentPassword: bob.password, newPassword: "bobs-new-pw-123" });
    expect(res.status).toBe(200);
  });
});
