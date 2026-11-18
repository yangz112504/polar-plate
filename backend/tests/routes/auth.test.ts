import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { sql } from "drizzle-orm";
import { createApp } from "../../src/app";
import { createUserRepository } from "../../src/users/userRepository";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";

const SECRET = "test-secret";
const { db, close } = createTestDb();
const app = createApp({ db, secretKey: SECRET });
const users = createUserRepository(db);

const alice = { username: "alice", email: "alice@example.com", password: "pw-alice-123" };

beforeEach(() => resetDb(db));
afterAll(() => close());

/** Registers `alice` through the API and returns her JWT. */
async function registerAlice(): Promise<string> {
  const res = await request(app).post("/api/users").send(alice);
  return res.body.token;
}

describe("GET /healthz", () => {
  it("returns 200 OK", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });
});

describe("POST /api/users (register)", () => {
  it("creates the user and returns 201 with a token carrying userId and username", async () => {
    const res = await request(app).post("/api/users").send(alice);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: "Successfully registered", success: true });
    const payload = jwt.verify(res.body.token, SECRET) as { userId: string; username: string };
    const stored = await users.findUserByUsername("alice");
    expect(payload).toMatchObject({ userId: stored!.id, username: "alice" });
  });

  it("stores a bcrypt hash, never the plaintext password", async () => {
    await request(app).post("/api/users").send(alice);
    const stored = await users.findUserByUsername("alice");
    expect(stored!.password).not.toBe(alice.password);
    expect(await bcrypt.compare(alice.password, stored!.password)).toBe(true);
  });

  it("stores the email lowercased", async () => {
    await request(app).post("/api/users").send({ ...alice, email: "Alice@Example.COM" });
    expect((await users.findUserByUsername("alice"))!.email).toBe("alice@example.com");
  });

  it.each(["username", "email", "password"])("returns 400 when %s is missing", async (field) => {
    const res = await request(app).post("/api/users").send({ ...alice, [field]: undefined });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("All fields are required");
  });

  it("returns 400 when a field is not a string (e.g. an operator object)", async () => {
    const res = await request(app).post("/api/users").send({ ...alice, username: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it("returns 400 'User already exists' for a duplicate username", async () => {
    await registerAlice();
    const res = await request(app).post("/api/users").send({ ...alice, email: "other@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("User already exists");
  });

  it("returns 400 'User already exists' for a duplicate email, ignoring case", async () => {
    await registerAlice();
    const res = await request(app).post("/api/users").send({ ...alice, username: "alice2", email: "ALICE@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("User already exists");
  });

  it("creates exactly one account when the same registration is sent concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post("/api/users").send(alice)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
    expect(rows[0].n).toBe(1);
  });
});

describe("POST /api/sessions (login)", () => {
  beforeEach(async () => {
    await registerAlice();
  });

  it("logs in by username and returns a token", async () => {
    const res = await request(app).post("/api/sessions").send({ username: "alice", password: alice.password });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "Login successful", success: true });
    expect(jwt.verify(res.body.token, SECRET)).toMatchObject({ username: "alice" });
  });

  it("logs in by email, ignoring case", async () => {
    const res = await request(app).post("/api/sessions").send({ email: "ALICE@example.com", password: alice.password });
    expect(res.status).toBe(200);
  });

  it("accepts a user whose bcrypt hash was imported by the migration", async () => {
    const hash = await bcrypt.hash("legacy-pw", 10);
    await users.createUser({ username: "legacy", email: "legacy@example.com", password: hash });
    const res = await request(app).post("/api/sessions").send({ username: "legacy", password: "legacy-pw" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["password is missing", { username: "alice" }],
    ["username and email are both missing", { password: "x" }],
  ])("returns 400 when %s", async (_name, body) => {
    const res = await request(app).post("/api/sessions").send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Username or email and password required");
  });

  it("returns 401 'User does not exist' for an unknown user", async () => {
    const res = await request(app).post("/api/sessions").send({ username: "nobody", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("User does not exist");
  });

  it("returns 401 'Invalid credentials' for a wrong password", async () => {
    const res = await request(app).post("/api/sessions").send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });
});

describe("GET /api/users/me", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/users/me")).status).toBe(401);
  });

  it("returns 403 for an invalid token", async () => {
    const res = await request(app).get("/api/users/me").set("Authorization", "Bearer not-a-token");
    expect(res.status).toBe(403);
  });

  it("returns the current user without any password field", async () => {
    const token = await registerAlice();
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "alice", email: "alice@example.com" });
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  // A deleted user's token and a legacy Mongo-id token are now rejected earlier (403) by requireAuth;
  // see tests/routes/tokenRevocation.test.ts.
});

describe("DELETE /api/sessions (logout)", () => {
  it("returns 200 (stateless logout)", async () => {
    const res = await request(app).delete("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out (stateless)");
  });
});
