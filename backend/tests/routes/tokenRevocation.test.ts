import { afterAll, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import { createUserRepository } from "../../src/users/userRepository";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

// Step 5, slice 1: a token is only valid while its `tokenVersion` claim matches the user's row.
const SECRET = "test-secret";
const { db, close } = createTestDb();
const app = createApp({ db, secretKey: SECRET });
const users = createUserRepository(db);
const alice = { username: "alice", email: "alice@example.com", password: "pw-alice-123" };

beforeEach(() => resetDb(db));
afterAll(() => close());

/** Registers alice through the API and returns her token. */
async function registerAlice(): Promise<string> {
  return (await request(app).post("/api/users").send(alice)).body.token;
}
/** Calls a protected route (GET /api/users/me) with the given token. */
const me = (token: string) => request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`);

describe("token revocation via tokenVersion", () => {
  it("new tokens carry tokenVersion 0", async () => {
    const token = await registerAlice();
    expect(jwt.verify(token, SECRET)).toMatchObject({ tokenVersion: 0 });
  });

  it("a token still works while the version matches", async () => {
    expect((await me(await registerAlice())).status).toBe(200);
  });

  it("an old token is rejected with 403 after the password is changed", async () => {
    const oldToken = await registerAlice();
    const user = (await users.findUserByUsername("alice"))!;
    await users.updatePasswordHash(user.id, "new-hash");
    const res = await me(oldToken);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("a token issued after the change carries the new version and works", async () => {
    await registerAlice();
    const user = (await users.findUserByUsername("alice"))!;
    // Make the stored hash a real one so login still works: re-hash through the repository.
    const bcrypt = (await import("bcrypt")).default;
    await users.updatePasswordHash(user.id, await bcrypt.hash("brand-new-pw", 10));
    const login = await request(app).post("/api/sessions").send({ username: "alice", password: "brand-new-pw" });
    expect(jwt.verify(login.body.token, SECRET)).toMatchObject({ tokenVersion: 1 });
    expect((await me(login.body.token)).status).toBe(200);
  });

  it("a token whose user was deleted is rejected with 403", async () => {
    const token = await registerAlice();
    await resetDb(db);
    expect((await me(token)).status).toBe(403);
  });

  it("an old token whose userId is a Mongo ObjectId is rejected with 403, not a crash", async () => {
    const legacy = jwt.sign({ userId: "68aa57aaede85b5ba76e4936", username: "x" }, SECRET);
    expect((await me(legacy)).status).toBe(403);
  });

  it("a token issued before this change (no tokenVersion claim) still works until the version is bumped", async () => {
    await registerAlice();
    const user = (await users.findUserByUsername("alice"))!;
    const preChange = jwt.sign({ userId: user.id, username: "alice" }, SECRET);
    expect((await me(preChange)).status).toBe(200);
    await users.updatePasswordHash(user.id, "new-hash");
    expect((await me(preChange)).status).toBe(403);
  });

  it("a token for a renamed user keeps working (a rename does not revoke it)", async () => {
    const token = await registerAlice();
    const user = (await users.findUserByUsername("alice"))!;
    await users.updateUsername(user.id, "alicia");
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alicia");
  });
});
