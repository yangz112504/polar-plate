import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";

export type User = {
  id: string;
  username: string;
  email: string;
  password: string;
  /** Bumped when the password changes; tokens carrying an older value are rejected. */
  tokenVersion: number;
  createdAt: Date;
};
/** `password` is the bcrypt hash, never plaintext. */
export type NewUser = { username: string; email: string; password: string };

/** Thrown when a username or email is already taken. */
export class UserAlreadyExistsError extends Error {
  constructor(message = "User already exists") {
    super(message);
    this.name = "UserAlreadyExistsError";
  }
}

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Checks whether an error (or the error it wraps) is a Postgres unique violation.
 * Drizzle wraps driver errors, so the code may be on `error.cause`.
 */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}

/**
 * Builds the user data-access object.
 * @param db Drizzle handle (injected so tests and production can use different databases).
 */
export function createUserRepository(db: Db) {
  /** Runs a lookup by one column and returns the first row or null. */
  async function findOne(where: ReturnType<typeof eq>): Promise<User | null> {
    const rows = await db.select().from(users).where(where).limit(1);
    return rows[0] ?? null;
  }

  return {
    /**
     * Inserts a user. The email is lowercased so lookups are case-insensitive.
     * @returns The created user.
     * @throws UserAlreadyExistsError if username or email is taken.
     */
    async createUser(input: NewUser): Promise<User> {
      try {
        const [row] = await db
          .insert(users)
          .values({ ...input, email: input.email.toLowerCase() })
          .returning();
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new UserAlreadyExistsError();
        throw error;
      }
    },
    /** @returns The user with this id, or null. */
    findUserById: (id: string) => findOne(eq(users.id, id)),
    /** @returns The user with this username, or null. */
    findUserByUsername: (username: string) => findOne(eq(users.username, username)),
    /** @returns The user with this email (matched case-insensitively), or null. */
    findUserByEmail: (email: string) => findOne(eq(users.email, email.toLowerCase())),

    /**
     * Renames a user. Does not revoke their tokens (the username is not what a token's validity rests on).
     * @param id The user's id.
     * @param username The new username (validated by the caller).
     * @returns The updated user, or null if no such user.
     * @throws UserAlreadyExistsError if another user already has this username.
     */
    async updateUsername(id: string, username: string): Promise<User | null> {
      try {
        const [row] = await db.update(users).set({ username }).where(eq(users.id, id)).returning();
        return row ?? null;
      } catch (error) {
        if (isUniqueViolation(error)) throw new UserAlreadyExistsError();
        throw error;
      }
    },

    /**
     * Stores a new password hash and bumps `tokenVersion`, which invalidates every token issued before.
     * The bump is done in SQL (`token_version + 1`) so two simultaneous changes cannot lose an increment.
     * @param id The user's id.
     * @param passwordHash A bcrypt hash, never plaintext.
     * @returns The updated user, or null if no such user.
     */
    async updatePasswordHash(id: string, passwordHash: string): Promise<User | null> {
      const [row] = await db
        .update(users)
        .set({ password: passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, id))
        .returning();
      return row ?? null;
    },
  };
}
export type UserRepository = ReturnType<typeof createUserRepository>;
