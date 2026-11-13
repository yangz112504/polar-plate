import { Router } from "express";
import { dayKey } from "../lib/dayKey";
import type { MenuService } from "./menuService";

const VALID_MEALS = new Set(["Breakfast", "Brunch", "Lunch", "Dinner"]);

/**
 * Builds GET /api/menus/:meal. The server decides the date (dayKey), never the client.
 * Responds 200 with both halls (plus `errors` if one failed), or 502 if both halls failed.
 * @param deps.menuService Source of menus.
 * @param deps.now Clock (injected so tests can fix the time).
 */
export function createMenuRoutes(deps: { menuService: MenuService; now: () => Date }): Router {
  const router = Router();

  router.get("/api/menus/:meal", async (req, res) => {
    const { meal } = req.params;
    if (!VALID_MEALS.has(meal)) {
      res.status(400).json({ error: "Invalid meal parameter" });
      return;
    }
    const menus = await deps.menuService.getMenus(dayKey(deps.now()), meal);
    if (menus.errors?.Thorne && menus.errors?.Moulton) {
      res.status(502).json({ error: "Error fetching menus", errors: menus.errors });
      return;
    }
    res.json(menus);
  });

  return router;
}
