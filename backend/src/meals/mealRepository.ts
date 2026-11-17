import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { meals, type MenuCategory } from "../db/schema";

/** `items` is null until a menu has been fetched and stored. */
export type Meal = { id: string; serviceDate: string; hall: string; mealType: string; items: MenuCategory[] | null };

/**
 * Builds the meal data-access object.
 * @param db Drizzle handle (injected).
 */
export function createMealRepository(db: Db) {
  return {
    /**
     * Stores a fetched menu on the meal row, creating the row if needed.
     * Safe to call repeatedly: a later call overwrites the earlier menu.
     * @param items Non-empty list of categories (callers never store empty menus).
     */
    async setMenuItems(serviceDate: string, hall: string, mealType: string, items: MenuCategory[]): Promise<void> {
      // Upsert on the (date, hall, type) unique key: fills a row a rating created, or inserts a new one.
      await db
        .insert(meals)
        .values({ serviceDate, hall, mealType, items })
        .onConflictDoUpdate({ target: [meals.serviceDate, meals.hall, meals.mealType], set: { items } });
    },
    /**
     * Read-only lookup: returns the meal for (date, hall, type) or null. Never creates a row,
     * so GET requests can't fill the table with meals nobody rated.
     */
    async findMeal(serviceDate: string, hall: string, mealType: string): Promise<Meal | null> {
      const rows = await db
        .select()
        .from(meals)
        .where(and(eq(meals.serviceDate, serviceDate), eq(meals.hall, hall), eq(meals.mealType, mealType)));
      return rows[0] ?? null;
    },
  };
}
export type MealRepository = ReturnType<typeof createMealRepository>;
