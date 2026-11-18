import { describe, expect, it } from "vitest";
import { passwordSchema, usernameSchema } from "@/lib/credentialRules";

// Mirrors backend/src/users/credentialRules.ts; the server stays the authority.
describe("usernameSchema", () => {
  it.each(["abc", "a".repeat(20), "al_ice-9", "Alice2"])("accepts %s", (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(true);
  });

  it("says 'at least 3' for a short name and 'at most 20' for a long one", () => {
    expect(usernameSchema.safeParse("ab").error?.issues[0].message).toMatch(/at least 3/i);
    expect(usernameSchema.safeParse("a".repeat(21)).error?.issues[0].message).toMatch(/at most 20/i);
  });

  it.each(["al ice", "al.ice", "al!ce", "ali©e"])("rejects %s with a message about allowed characters", (name) => {
    expect(usernameSchema.safeParse(name).error?.issues[0].message).toMatch(/letters, digits/i);
  });
});

describe("passwordSchema", () => {
  it("accepts 8 characters and 72 bytes", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("é".repeat(36)).success).toBe(true); // 36 x 2 bytes = 72
  });

  it("rejects fewer than 8 characters with an 'at least 8' message", () => {
    expect(passwordSchema.safeParse("short7!").error?.issues[0].message).toMatch(/at least 8/i);
  });

  it("rejects more than 72 BYTES, which bcrypt would silently cut off", () => {
    expect(passwordSchema.safeParse("x".repeat(73)).error?.issues[0].message).toMatch(/72/);
    expect(passwordSchema.safeParse("é".repeat(37)).success).toBe(false); // 74 bytes
  });
});
