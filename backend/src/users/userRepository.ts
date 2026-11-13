import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";

export type User = { id: string; username: string; email: string; password: string; createdAt: Date };
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
  };
}
export type UserRepository = ReturnType<typeof createUserRepository>;
