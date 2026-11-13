import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { MealRepository } from "../meals/mealRepository";
import { InvalidScoreError, type RatingRepository } from "../ratings/ratingRepository";
import type { AuthedRequest } from "./authMiddleware";

/** 'YYYY-MM-DD' that is also a real calendar day (rejects 2026-13-45). */
const dateString = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}, "Invalid date");
const name = z.string().min(1);
const mealKey = z.object({ hall: name, meal: name, date: dateString });
const rateBody = mealKey.extend({ rating: z.number() });

/** Formats an average the way the old API did: 2-decimal string, or the number 0 when unrated. */
function formatAverage(average: number | null): string | 0 {
  return average === null ? 0 : average.toFixed(2);
}

/**
 * Builds the rating routes. The frontend still identifies a meal by hall/meal/date,
 * so each route translates that into a `meals` row.
 */
export function createRatingRoutes(deps: {
  ratings: RatingRepository;
  meals: MealRepository;
  requireAuth: RequestHandler;
}): Router {
  const router = Router();
  router.use("/api/ratings", deps.requireAuth);

  // Submit or update the caller's rating, then return fresh stats.
  router.post("/api/ratings", async (req, res) => {
    const body = rateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "Hall, meal, and rating required (date as YYYY-MM-DD)" });
      return;
    }
    const { hall, meal, date, rating } = body.data;
    const { userId } = (req as AuthedRequest).user;
    try {
      const { id: mealId } = await deps.meals.getOrCreateMeal(date, hall, meal);
      const { created } = await deps.ratings.upsertRating({ userId, mealId, score: rating });
      const stats = await deps.ratings.getMealStats(mealId);
      res.json({
        message: "Rating saved",
        avgRating: formatAverage(stats.average),
        totalRatings: stats.count,
        updated: !created,
        userRating: rating,
      });
    } catch (err) {
      if (err instanceof InvalidScoreError) {
        res.status(400).json({ message: err.message });
        return;
      }
      throw err;
    }
  });

  // The caller's own rating. Declared before the /:hall/:meal routes for clarity.
  router.get("/api/ratings/user", async (req, res) => {
    const query = mealKey.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ message: "Hall, meal, and date required" });
      return;
    }
    const { hall, meal, date } = query.data;
    const found = await deps.meals.findMeal(date, hall, meal);
    const userRating = found ? await deps.ratings.findUserRating((req as AuthedRequest).user.userId, found.id) : null;
    res.json({ userRating });
  });

  // Everyone's ratings for one meal, highest first, in the old response shape.
  router.get("/api/ratings/:hall/:meal/:date", async (req, res) => {
    const params = mealKey.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid hall, meal or date" });
      return;
    }
    const { hall, meal, date } = params.data;
    const found = await deps.meals.findMeal(date, hall, meal);
    const rows = found ? await deps.ratings.listRatingsForMeal(found.id) : [];
    res.json({ ratings: rows.map((r) => ({ _id: r.id, rating: r.score, user: { username: r.username } })) });
  });

  // Average and count for one meal.
  router.get("/api/ratings/:hall/:meal", async (req, res) => {
    const params = mealKey.safeParse({ ...req.params, date: req.query.date });
    if (!params.success) {
      res.status(400).json({ message: "Hall, meal, and date required" });
      return;
    }
    const { hall, meal, date } = params.data;
    const found = await deps.meals.findMeal(date, hall, meal);
    const stats = found ? await deps.ratings.getMealStats(found.id) : { average: null, count: 0 };
    res.json({ avgRating: formatAverage(stats.average), totalRatings: stats.count });
  });

  return router;
}
