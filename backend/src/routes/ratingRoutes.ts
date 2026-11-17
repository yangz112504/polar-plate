import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { dayKey } from "../lib/dayKey";
import type { MealRepository } from "../meals/mealRepository";
import { getSchedule } from "../menus/schedule";
import { InvalidScoreError, type RatingRepository } from "../ratings/ratingRepository";
import type { AuthedRequest } from "./authMiddleware";

// Allow-lists: without them any string would create a `meals` row (e.g. "Snack").
const hall = z.enum(["Thorne", "Moulton"]);
const meal = z.enum(["Breakfast", "Brunch", "Lunch", "Dinner"]);
// The date is deliberately absent: the server decides the day (dayKey), never the client.
const mealKey = z.object({ hall, meal });
const rateBody = mealKey.extend({ rating: z.number() });

/** What a client sees for a bad score; says what is allowed instead of a generic "invalid input". */
const SCORE_MESSAGE = "Rating must be between 0.5 and 5.0 in steps of 0.5";

/** Formats an average the way the old API did: 2-decimal string, or the number 0 when unrated. */
function formatAverage(average: number | null): string | 0 {
  return average === null ? 0 : average.toFixed(2);
}

/**
 * Builds the rating routes. A meal is identified by hall + meal name; the day is always
 * the server's current New York day, so each route translates that into a `meals` row.
 * @param deps.ratings Rating repository.
 * @param deps.meals Meal repository.
 * @param deps.requireAuth Middleware that rejects requests without a valid token.
 * @param deps.now Clock (injected so tests can fix the time).
 */
export function createRatingRoutes(deps: {
  ratings: RatingRepository;
  meals: MealRepository;
  requireAuth: RequestHandler;
  now: () => Date;
}): Router {
  const router = Router();
  router.use("/api/ratings", deps.requireAuth);

  // Submit or update the caller's rating for today's meal, then return fresh stats.
  router.post("/api/ratings", async (req, res) => {
    const body = rateBody.safeParse(req.body);
    if (!body.success) {
      // If only the rating field is wrong (missing, not a number), say what a valid rating is.
      const onlyRatingWrong = body.error.issues.every((issue) => issue.path[0] === "rating");
      res.status(400).json({ message: onlyRatingWrong ? SCORE_MESSAGE : "Valid hall, meal, and rating required" });
      return;
    }
    const { hall, meal, rating } = body.data;
    // Only meals served today can be rated (no Lunch on a Saturday), so the schedule is the single
    // source of truth for both the tabs and what may be rated. Checked before touching the DB.
    const schedule = getSchedule(deps.now());
    if (!schedule.meals.includes(meal)) {
      res.status(400).json({ message: `${meal} is not served today` });
      return;
    }
    const { userId } = (req as AuthedRequest).user;
    try {
      // One database round trip: meal, rating and the new average are all handled by a single statement.
      const { created, average, count } = await deps.ratings.rateMeal({
        userId,
        serviceDate: schedule.date,
        hall,
        mealType: meal,
        score: rating,
      });
      res.json({
        message: "Rating saved",
        avgRating: formatAverage(average),
        totalRatings: count,
        updated: !created,
        userRating: rating,
      });
    } catch (err) {
      if (err instanceof InvalidScoreError) {
        res.status(400).json({ message: SCORE_MESSAGE });
        return;
      }
      throw err;
    }
  });

  // The caller's own rating. Declared before the /:hall/:meal routes for clarity.
  router.get("/api/ratings/user", async (req, res) => {
    const query = mealKey.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: "Valid hall and meal required" });
      return;
    }
    const found = await deps.meals.findMeal(dayKey(deps.now()), query.data.hall, query.data.meal);
    const userRating = found ? await deps.ratings.findUserRating((req as AuthedRequest).user.userId, found.id) : null;
    res.json({ userRating });
  });

  // Everyone's ratings for today's meal, highest first, in the old response shape.
  router.get("/api/ratings/:hall/:meal/all", async (req, res) => {
    const params = mealKey.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid hall or meal" });
      return;
    }
    const found = await deps.meals.findMeal(dayKey(deps.now()), params.data.hall, params.data.meal);
    const rows = found ? await deps.ratings.listRatingsForMeal(found.id) : [];
    res.json({ ratings: rows.map((r) => ({ _id: r.id, rating: r.score, user: { username: r.username } })) });
  });

  // Average and count for today's meal.
  router.get("/api/ratings/:hall/:meal", async (req, res) => {
    const params = mealKey.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid hall or meal" });
      return;
    }
    const found = await deps.meals.findMeal(dayKey(deps.now()), params.data.hall, params.data.meal);
    const stats = found ? await deps.ratings.getMealStats(found.id) : { average: null, count: 0 };
    res.json({ avgRating: formatAverage(stats.average), totalRatings: stats.count });
  });

  return router;
}
