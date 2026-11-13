import "dotenv/config";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { createMealRepository } from "./meals/mealRepository";
import { fetchMenu } from "./menus/menuClient";
import { createMenuService } from "./menus/menuService";

/**
 * Process entry point: reads config from env, connects to Postgres and starts listening.
 * Fails fast with a clear message if required env vars are missing.
 */
function main(): void {
  const { DATABASE_URL, SECRET_KEY } = process.env;
  if (!DATABASE_URL || !SECRET_KEY) throw new Error("DATABASE_URL and SECRET_KEY must be set in backend/.env");

  const { db } = createDb(DATABASE_URL);
  const menuService = createMenuService({ meals: createMealRepository(db), fetchMenu: (d, h, m) => fetchMenu(d, h, m) });
  const app = createApp({ db, secretKey: SECRET_KEY, menuService });
  const port = process.env.PORT || 5001;
  app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
}

main();
