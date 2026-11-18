import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/testDb";
import { resetDb } from "../helpers/resetDb";
import { createUserRepository, UserAlreadyExistsError } from "../../src/users/userRepository";

const { db, close } = createTestDb();
const repo = createUserRepository(db);
const alice = { username: "alice", email: "alice@example.com", password: "hash" };

beforeEach(() => resetDb(db));
afterAll(() => close());

describe("userRepository", () => {
  it("createUser returns a uuid id, username, email and createdAt", async () => {
    const user = await repo.createUser(alice);
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(user.username).toBe("alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("finds an existing user by id, username and email", async () => {
    const user = await repo.createUser(alice);
    expect((await repo.findUserById(user.id))?.id).toBe(user.id);
    expect((await repo.findUserByUsername("alice"))?.id).toBe(user.id);
    expect((await repo.findUserByEmail("alice@example.com"))?.id).toBe(user.id);
  });

  it("returns null when no user matches", async () => {
    expect(await repo.findUserById("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await repo.findUserByUsername("nobody")).toBeNull();
    expect(await repo.findUserByEmail("nobody@example.com")).toBeNull();
  });

  it("rejects a duplicate username with UserAlreadyExistsError", async () => {
    await repo.createUser(alice);
    await expect(repo.createUser({ ...alice, email: "other@example.com" })).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("rejects a duplicate email with UserAlreadyExistsError", async () => {
    await repo.createUser(alice);
    await expect(repo.createUser({ ...alice, username: "alice2" })).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("stores the email lowercased and finds it case-insensitively", async () => {
    const user = await repo.createUser({ ...alice, email: "Alice@Example.COM" });
    expect(user.email).toBe("alice@example.com");
    expect((await repo.findUserByEmail("ALICE@example.com"))?.id).toBe(user.id);
  });

  it("a new user starts at tokenVersion 0", async () => {
    expect((await repo.createUser(alice)).tokenVersion).toBe(0);
  });

  it("updateUsername changes the username and returns the updated user", async () => {
    const user = await repo.createUser(alice);
    const updated = await repo.updateUsername(user.id, "alicia");
    expect(updated?.username).toBe("alicia");
    expect((await repo.findUserByUsername("alicia"))?.id).toBe(user.id);
    expect(await repo.findUserByUsername("alice")).toBeNull();
  });

  it("updateUsername rejects a name another user has with UserAlreadyExistsError", async () => {
    await repo.createUser(alice);
    const bob = await repo.createUser({ username: "bob", email: "bob@example.com", password: "h" });
    await expect(repo.updateUsername(bob.id, "alice")).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("updateUsername returns null for an unknown user id", async () => {
    expect(await repo.updateUsername("00000000-0000-0000-0000-000000000000", "ghost")).toBeNull();
  });

  it("updatePasswordHash stores the new hash and bumps tokenVersion each time", async () => {
    const user = await repo.createUser(alice);
    await repo.updatePasswordHash(user.id, "hash-2");
    const after1 = (await repo.findUserById(user.id))!;
    expect(after1.password).toBe("hash-2");
    expect(after1.tokenVersion).toBe(1);
    await repo.updatePasswordHash(user.id, "hash-3");
    expect((await repo.findUserById(user.id))!.tokenVersion).toBe(2);
  });

  it("treats emails that differ only by case as duplicates", async () => {
    await repo.createUser(alice);
    await expect(
      repo.createUser({ username: "alice2", email: "ALICE@EXAMPLE.COM", password: "h" }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });
});
