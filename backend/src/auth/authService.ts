import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { UserRepository } from "../users/userRepository";

/** bcrypt work factor. Matches the old app, so migrated hashes and new hashes behave alike. */
const SALT_ROUNDS = 10;
/** How long a login stays valid. */
const TOKEN_LIFETIME = "7d";

/** What we put inside the JWT. */
export type TokenPayload = {
  userId: string;
  username: string;
  /** Must equal the user's `tokenVersion` in the DB. Absent on tokens issued before it existed (treated as 0). */
  tokenVersion?: number;
};

/** Thrown by `login` when the username/email is unknown or the password is wrong. */
export class LoginError extends Error {
  constructor(
    message: "User does not exist" | "Invalid credentials",
  ) {
    super(message);
    this.name = "LoginError";
  }
}

/**
 * Builds the auth service: password hashing and JWT handling, kept out of the routes.
 * @param users User repository (injected).
 * @param secretKey Secret used to sign and verify JWTs; comes from env, never hard-coded.
 */
export function createAuthService(users: UserRepository, secretKey: string) {
  /** Signs a 7-day token for a user. */
  function signToken(user: { id: string; username: string; tokenVersion: number }): string {
    const payload: TokenPayload = { userId: user.id, username: user.username, tokenVersion: user.tokenVersion };
    return jwt.sign(payload, secretKey, { expiresIn: TOKEN_LIFETIME });
  }

  return {
    /**
     * Hashes the password, creates the user and returns a login token.
     * @throws UserAlreadyExistsError if the username or email is taken.
     */
    async register(input: { username: string; email: string; password: string }): Promise<string> {
      const password = await bcrypt.hash(input.password, SALT_ROUNDS);
      const user = await users.createUser({ username: input.username, email: input.email, password });
      return signToken(user);
    },

    /**
     * Checks credentials and returns a token.
     * @param input Either `username` or `email` (username wins if both are sent), plus `password`.
     * @throws LoginError for an unknown user or wrong password.
     */
    async login(input: { username?: string; email?: string; password: string }): Promise<string> {
      const user = input.username
        ? await users.findUserByUsername(input.username)
        : await users.findUserByEmail(input.email as string);
      if (!user) throw new LoginError("User does not exist");
      if (!(await bcrypt.compare(input.password, user.password))) throw new LoginError("Invalid credentials");
      return signToken(user);
    },

    /**
     * Verifies a JWT's signature and expiry.
     * @returns The payload, or null if the token is invalid or expired.
     */
    verifyToken(token: string): TokenPayload | null {
      try {
        return jwt.verify(token, secretKey) as TokenPayload;
      } catch {
        return null;
      }
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
