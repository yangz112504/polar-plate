import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { createAuthService } from "./auth/authService";
import type { Db } from "./db/client";
import type { MenuService } from "./menus/menuService";
import { createMenuRoutes } from "./menus/menuRoutes";
import { createMealRepository } from "./meals/mealRepository";
import { createRatingRepository } from "./ratings/ratingRepository";
import { createRequireAuth } from "./routes/authMiddleware";
import { createRatingRoutes } from "./routes/ratingRoutes";
import { createUserRoutes } from "./routes/userRoutes";
import { createUserRepository } from "./users/userRepository";

/** Dependencies the app needs; injected so tests can use a test DB and a fake secret. */
export type AppDeps = {
  db: Db;
  secretKey: string;
  /** Menu source for GET /api/menus/:meal; omit to leave the route off. */
  menuService?: MenuService;
  /** Clock, injected so tests can fix "now". Defaults to the real time. */
  now?: () => Date;
};

/**
 * Builds the Express app (routes + middleware) without starting a server,
 * so supertest can call it directly.
 * @param deps Database handle, JWT secret, and optional menu service and clock.
 * @returns A configured Express app.
 */
export function createApp(deps: AppDeps): Express {
  const users = createUserRepository(deps.db);
  const meals = createMealRepository(deps.db);
  const ratings = createRatingRepository(deps.db);
  const auth = createAuthService(users, deps.secretKey);
  const requireAuth = createRequireAuth(auth, users);
  const now = deps.now ?? (() => new Date());

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(helmet());
  app.use(cors());

  if (deps.menuService) app.use(createMenuRoutes({ menuService: deps.menuService, now }));

  app.get("/healthz", (_req, res) => {
    res.status(200).send("OK");
  });
  app.use(createUserRoutes({ auth, users, requireAuth }));
  app.use(createRatingRoutes({ ratings, meals, requireAuth, now }));

  // Express 5 forwards errors thrown in async handlers here. Log details server-side,
  // but never leak them to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  });
  return app;
}
