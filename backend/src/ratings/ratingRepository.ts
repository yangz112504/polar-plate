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
     * Inserts or updates the user's rating for a meal in one atomic statement,
     * so two simultaneous requests can't create duplicate rows.
     * @param input.score Must be 0.5-5.0 in 0.5 steps.
     * @returns `created: true` if a new row was inserted, false if updated.
     * @throws InvalidScoreError if the score is invalid.
     */
    async upsertRating(input: { userId: string; mealId: string; score: number }): Promise<{ created: boolean }> {
      if (!isValidScore(input.score)) throw new InvalidScoreError(input.score);
      const score = input.score.toFixed(1); // numeric columns take strings
      // `xmax = 0` is true only for freshly inserted rows in Postgres, which tells us
      // insert vs update without a second query.
      const [row] = await db
        .insert(ratings)
        .values({ userId: input.userId, mealId: input.mealId, score })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.mealId],
          set: { score, updatedAt: sql`now()` },
        })
        .returning({ created: sql<boolean>`(xmax = 0)` });
      return { created: row.created };
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
