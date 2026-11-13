import { sql } from "drizzle-orm";
import {
  check, date, jsonb, numeric, pgTable, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";

/** One row = one account. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  // Holds a bcrypt hash, never plaintext (the column is named "password" by choice).
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS(); // RLS on + no policies = Supabase's public REST API can't read this table.

/** Shape of the scraped menu stored in `meals.items`. */
export type MenuCategory = { category: string; items: string[] };

/** One row = one hall's meal on one day; doubles as the daily menu cache. */
export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceDate: date("service_date").notNull(),
    hall: text("hall").notNull(),
    mealType: text("meal_type").notNull(),
    items: jsonb("items").$type<MenuCategory[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.serviceDate, t.hall, t.mealType)],
).enableRLS();

/** One row = one user's score for one meal. Re-rating updates the row. */
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    mealId: uuid("meal_id").notNull().references(() => meals.id),
    score: numeric("score", { precision: 2, scale: 1 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.mealId),
    check("score_range_half_steps", sql`${t.score} >= 0.5 AND ${t.score} <= 5.0 AND (${t.score} * 2) = floor(${t.score} * 2)`),
  ],
).enableRLS();
