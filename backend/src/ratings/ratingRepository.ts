import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { ratings, users } from "../db/schema";

/** Thrown when a score isn't 0.5–5.0 in 0.5 steps. */
export class InvalidScoreError extends Error {
  constructor(score: number) {
    super(`Invalid score ${score}: must be 0.5-5.0 in steps of 0.5`);
    this.name = "InvalidScoreError";
  }
}

/** Returns true for 0.5, 1, 1.5 ... 5. The DB CHECK constraint enforces the same rule. */
function isValidScore(score: number): boolean {
  return score >= 0.5 && score <= 5 && Number.isInteger(score * 2);
}

/**
 * Builds the rating data-access object.
 * @param db Drizzle handle (injected).
 */
export function createRatingRepository(db: Db) {
  return {
    /**
     * Saves the user's rating for a meal and returns the meal's new average and count, all in ONE SQL
     * statement (one database round trip). Chosen for speed over readability; see SystemDesign.md #27.
     * Creates the meal row if it doesn't exist yet. Re-rating replaces the user's earlier score.
     * @param input.serviceDate 'YYYY-MM-DD' from dayKey().
     * @param input.score Must be 0.5-5.0 in 0.5 steps.
     * @returns The meal id, whether the rating row was newly created, and the average and number of
     *   ratings INCLUDING this one. A rating saved by someone else at the exact same instant may be
     *   missing from the average (it shows up on the next read).
     * @throws InvalidScoreError if the score is invalid (checked before touching the database).
     */
    async rateMeal(input: {
      userId: string;
      serviceDate: string;
      hall: string;
      mealType: string;
      score: number;
    }): Promise<{ mealId: string; created: boolean; average: number; count: number }> {
      if (!isValidScore(input.score)) throw new InvalidScoreError(input.score);
      const score = input.score.toFixed(1); // numeric columns take strings

      /*
       * WHAT THIS STATEMENT DOES (it is one SQL statement made of three named steps, written as a
       * "WITH" query, also called a (Common Table Expression) CTE; the database runs them together in a single round trip):
       *
       *   step m: INSERT INTO meals ... ON CONFLICT DO UPDATE
       *           Find the meal row for (date, hall, meal type), creating it if missing, and return its id.
       *           The DO UPDATE only sets service_date to its own value (a no-op that changes nothing).
       *           It is there because DO NOTHING returns no row when the meal already exists, and we
       *           need the id either way. The menu in `items` is never touched.
       *
       *   step r: INSERT INTO ratings ... ON CONFLICT DO UPDATE
       *           Save this user's score for that meal, or replace their old score if they already rated.
       *           `xmax = 0` is true only for a brand-new row, which tells us "created" vs "updated".
       *
       *   step o: SELECT count(*), sum(score) FROM ratings WHERE meal = m AND user <> this user
       *           Add up everyone ELSE's ratings for this meal. All steps of one statement see the same
       *           snapshot of the table, so step o cannot see the row step r just wrote. That is why we
       *           leave this user out here and add their new score in the final SELECT below.
       *
       *   final SELECT: average = (others' total + new score) / (others' count + 1), count = others + 1.
       *
       * The same work done the readable way takes 3 to 4 separate queries (find meal, create meal,
       * save rating, read average), each a network round trip to the database.
       * The UNIQUE keys on meals and ratings still decide any race, so this stays atomic.
       */
      const rows = await db.execute<{ meal_id: string; created: boolean; average: string; count: number }>(sql`
        WITH m AS (
          INSERT INTO meals (service_date, hall, meal_type)
          VALUES (${input.serviceDate}::date, ${input.hall}, ${input.mealType})
          ON CONFLICT (service_date, hall, meal_type) DO UPDATE SET service_date = EXCLUDED.service_date
          RETURNING id
        ),
        r AS (
          INSERT INTO ratings (user_id, meal_id, score)
          SELECT ${input.userId}::uuid, m.id, ${score}::numeric FROM m
          ON CONFLICT (user_id, meal_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now()
          RETURNING meal_id, (xmax = 0) AS created
        ),
        o AS (
          SELECT count(*)::int AS n, coalesce(sum(score), 0) AS total
          FROM ratings
          WHERE meal_id = (SELECT id FROM m) AND user_id <> ${input.userId}::uuid
        )
        SELECT r.meal_id, r.created, (o.total + ${score}::numeric) / (o.n + 1) AS average, o.n + 1 AS count
        FROM r, o
      `);
      const row = rows[0];
      return { mealId: row.meal_id, created: row.created, average: Number(row.average), count: Number(row.count) };
    },
    /** @returns The user's score as a number, or null if they haven't rated. */
    async findUserRating(userId: string, mealId: string): Promise<number | null> {
      const rows = await db
        .select({ score: ratings.score })
        .from(ratings)
        .where(sql`${ratings.userId} = ${userId} AND ${ratings.mealId} = ${mealId}`);
      return rows[0] ? Number(rows[0].score) : null;
    },
    /** @returns Average (null if unrated) and number of ratings for the meal. */
    async getMealStats(mealId: string): Promise<{ average: number | null; count: number }> {
      const [row] = await db
        .select({ average: sql<string | null>`avg(${ratings.score})`, count: sql<number>`count(*)::int` })
        .from(ratings)
        .where(eq(ratings.mealId, mealId));
      return { average: row.average === null ? null : Number(row.average), count: row.count };
    },
    /** @returns Each rating's id, rater username and score, highest score first. */
    async listRatingsForMeal(mealId: string): Promise<{ id: string; username: string; score: number }[]> {
      const rows = await db
        .select({ id: ratings.id, username: users.username, score: ratings.score })
        .from(ratings)
        .innerJoin(users, eq(ratings.userId, users.id))
        .where(eq(ratings.mealId, mealId))
        .orderBy(desc(ratings.score));
      return rows.map((r) => ({ id: r.id, username: r.username, score: Number(r.score) }));
    },
  };
}
export type RatingRepository = ReturnType<typeof createRatingRepository>;
