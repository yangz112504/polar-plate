import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService } from "../auth/authService";
import { LoginError, PasswordChangeError } from "../auth/authService";
import { PASSWORD_MESSAGE, passwordRule, USERNAME_MESSAGE, usernameRule } from "../users/credentialRules";
import type { UserRepository } from "../users/userRepository";
import { UserAlreadyExistsError } from "../users/userRepository";
import type { AuthedRequest } from "./authMiddleware";

const nonEmpty = z.string().min(1);
const registerBody = z.object({ username: nonEmpty, email: nonEmpty, password: nonEmpty });
const loginBody = z
  .object({ username: nonEmpty.optional(), email: nonEmpty.optional(), password: nonEmpty })
  .refine((b) => b.username || b.email);
// Registration is checked in two steps: first "are the fields there" (message below), then the format rules.
const registerRules = z.object({ username: usernameRule, password: passwordRule });
const renameBody = z.object({ username: usernameRule });
const changePasswordBody = z.object({ currentPassword: nonEmpty, newPassword: passwordRule });

/** Failed password-change attempts allowed per user in one window (guards against guessing with a stolen token). */
const PASSWORD_ATTEMPTS = 5;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/**
 * Builds the register / login / current-user / rename / change-password / logout routes.
 * Routes only parse input and shape responses; logic lives in the auth service and repository.
 */
export function createUserRoutes(deps: { auth: AuthService; users: UserRepository; requireAuth: RequestHandler }): Router {
  const router = Router();

  // Counts FAILED attempts only (successes are skipped), per user id rather than per IP: the route is
  // behind requireAuth, so we know who is asking, and shared IPs (dorm wifi) must not lock each other out.
  // Built here, so every createApp() call gets its own counters (tests rely on that). In-memory: it resets
  // on restart and is not shared between servers, which is fine for one server; use a shared store (Redis) at scale.
  const passwordLimiter = rateLimit({
    windowMs: PASSWORD_WINDOW_MS,
    limit: PASSWORD_ATTEMPTS,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => (req as AuthedRequest).user.userId,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again later." },
  });

  // Register. Body is validated with zod so objects like {"$ne": null} are rejected as non-strings.
  router.post("/api/users", async (req, res) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "All fields are required" });
      return;
    }
    const rules = registerRules.safeParse(body.data);
    if (!rules.success) {
      res.status(400).json({ message: rules.error.issues[0].message });
      return;
    }
    try {
      const token = await deps.auth.register(body.data);
      res.status(201).json({ message: "Successfully registered", success: true, token });
    } catch (err) {
      if (err instanceof UserAlreadyExistsError) {
        res.status(400).json({ message: "User already exists" });
        return;
      }
      throw err; // handled by the app-wide error handler (500)
    }
  });

  // Login by username or email.
  router.post("/api/sessions", async (req, res) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "Username or email and password required" });
      return;
    }
    try {
      const token = await deps.auth.login(body.data);
      res.json({ message: "Login successful", success: true, token });
    } catch (err) {
      if (err instanceof LoginError) {
        res.status(401).json({ message: err.message });
        return;
      }
      throw err;
    }
  });

  // Current user (never includes the password hash).
  router.get("/api/users/me", deps.requireAuth, async (req, res) => {
    const { userId } = (req as AuthedRequest).user;
    // requireAuth already checked the user exists; this only covers a delete between the two lookups.
    const user = await deps.users.findUserById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json({ user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt } });
  });

  // Change username. The token stays valid (only a password change revokes tokens).
  router.patch("/api/users/me", deps.requireAuth, async (req, res) => {
    const body = renameBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: USERNAME_MESSAGE });
      return;
    }
    try {
      const user = await deps.users.updateUsername((req as AuthedRequest).user.userId, body.data.username);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      res.json({ user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt } });
    } catch (err) {
      if (err instanceof UserAlreadyExistsError) {
        res.status(409).json({ message: "Username already taken" });
        return;
      }
      throw err;
    }
  });

  // Change password. Responds with a fresh token because this revokes all older ones, including the caller's.
  router.put("/api/users/me/password", deps.requireAuth, passwordLimiter, async (req, res) => {
    const body = changePasswordBody.safeParse(req.body);
    if (!body.success) {
      // Say which field is wrong, without echoing zod internals.
      const newPasswordBad = body.error.issues.some((i) => i.path[0] === "newPassword");
      res.status(400).json({ message: newPasswordBad ? PASSWORD_MESSAGE : "Current and new password are required" });
      return;
    }
    try {
      const token = await deps.auth.changePassword((req as AuthedRequest).user.userId, body.data);
      res.json({ message: "Password changed", token });
    } catch (err) {
      if (err instanceof PasswordChangeError) {
        res.status(400).json({ message: err.message });
        return;
      }
      throw err;
    }
  });

  // Logout is stateless: the client just discards its token.
  router.delete("/api/sessions", (_req, res) => {
    res.status(200).json({ message: "Logged out (stateless)" });
  });

  return router;
}
