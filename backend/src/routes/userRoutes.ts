import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/authService";
import { LoginError } from "../auth/authService";
import type { UserRepository } from "../users/userRepository";
import { UserAlreadyExistsError } from "../users/userRepository";
import type { AuthedRequest } from "./authMiddleware";

const nonEmpty = z.string().min(1);
const registerBody = z.object({ username: nonEmpty, email: nonEmpty, password: nonEmpty });
const loginBody = z
  .object({ username: nonEmpty.optional(), email: nonEmpty.optional(), password: nonEmpty })
  .refine((b) => b.username || b.email);

/**
 * Builds the register / login / current-user / logout routes.
 * Routes only parse input and shape responses; logic lives in the auth service and repository.
 */
export function createUserRoutes(deps: { auth: AuthService; users: UserRepository; requireAuth: RequestHandler }): Router {
  const router = Router();

  // Register. Body is validated with zod so objects like {"$ne": null} are rejected as non-strings.
  router.post("/api/users", async (req, res) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "All fields are required" });
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

  // Logout is stateless: the client just discards its token.
  router.delete("/api/sessions", (_req, res) => {
    res.status(200).json({ message: "Logged out (stateless)" });
  });

  return router;
}
