import { sql } from "drizzle-orm";
import type { Db } from "../../src/db/client";

/**
 * Test fixture: inserts a meal row with no menu (items null), like the row a first rating leaves behind,
 * and returns its id. Plain SQL so tests don't depend on the repository code they are checking.
 */
export async function insertMeal(db: Db, serviceDate: string, hall: string, mealType: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO meals (service_date, hall, meal_type) VALUES (${serviceDate}::date, ${hall}, ${mealType}) RETURNING id`,
  );
  return rows[0].id;
}
