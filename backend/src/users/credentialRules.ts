import { z } from "zod";

/** Shown when a username breaks the rules (also used for a missing or non-string value). */
export const USERNAME_MESSAGE = "Username must be 3-20 characters: letters, digits, _ or -";
/** Shown when a password breaks the rules (also used for a missing or non-string value). */
export const PASSWORD_MESSAGE = "Password must be 8 to 72 characters";

/**
 * bcrypt only reads the first 72 BYTES of a password and silently ignores the rest, so a longer
 * password would be accepted but only partly checked. We refuse it instead. (A non-ASCII
 * character can take several bytes, which is why this counts bytes, not characters.)
 */
const BCRYPT_MAX_BYTES = 72;

/** One rule for every place a username is chosen: registration and rename. Login does not use it, so older accounts still log in. */
export const usernameRule = z
  .string({ error: USERNAME_MESSAGE })
  .regex(/^[A-Za-z0-9_-]{3,20}$/, USERNAME_MESSAGE);

/** One rule for every place a password is chosen: registration and password change. */
export const passwordRule = z
  .string({ error: PASSWORD_MESSAGE })
  .min(8, PASSWORD_MESSAGE)
  .refine((p) => Buffer.byteLength(p, "utf8") <= BCRYPT_MAX_BYTES, PASSWORD_MESSAGE);
