import { z } from "zod";

/**
 * Username and password rules, shared by the register form and the settings forms. They mirror
 * backend/src/users/credentialRules.ts, which is the real authority (this copy only gives friendly,
 * instant messages). Change both together.
 */

/** 3-20 characters: letters, digits, `_` and `-`. */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be at most 20 characters.")
  .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, digits, _ or -.");

/**
 * At least 8 characters and at most 72 BYTES: bcrypt ignores everything after 72 bytes, so the server
 * refuses longer passwords. Bytes, not characters, because "é" takes 2 bytes.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Password must be at most 72 bytes.");
