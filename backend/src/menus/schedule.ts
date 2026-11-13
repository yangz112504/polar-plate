/** The meals Bowdoin serves. Weekdays use Breakfast/Lunch/Dinner; weekends use Brunch/Dinner. */
export type ScheduleMeal = "Breakfast" | "Brunch" | "Lunch" | "Dinner";

/** What the frontend needs to draw the meal tabs (the hall tabs, Thorne/Moulton, are separate). */
export interface Schedule {
  /** Bowdoin's calendar day (America/New_York) as 'YYYY-MM-DD'. */
  date: string;
  /** Meal tabs for the day, in left-to-right display order. */
  meals: ScheduleMeal[];
  /** The meal tab to open first, chosen by New York time of day. Always one of `meals`. */
  defaultMeal: ScheduleMeal;
}

/** Formatter reused across calls. h23 avoids the "24:00" some engines print at midnight. */
const nyParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * Decides which meal tabs exist today and which one opens by default.
 * Weekdays: Breakfast (12a-10a), Lunch (10a-5p), Dinner (5p-midnight).
 * Weekends: Brunch (12a-5p), Dinner (5p-midnight). All times are America/New_York,
 * read through Intl so daylight-saving shifts are handled by the platform.
 * Pure function of `now`, so tests can pass any instant.
 * @param now The instant to evaluate.
 * @returns The date, the meal tabs and the default meal.
 */
export function getSchedule(now: Date): Schedule {
  const p = Object.fromEntries(nyParts.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const hour = Number(p.hour);
  const isWeekend = p.weekday === "Sat" || p.weekday === "Sun";

  if (isWeekend) {
    return { date, meals: ["Brunch", "Dinner"], defaultMeal: hour < 17 ? "Brunch" : "Dinner" };
  }
  const defaultMeal: ScheduleMeal = hour < 10 ? "Breakfast" : hour < 17 ? "Lunch" : "Dinner";
  return { date, meals: ["Breakfast", "Lunch", "Dinner"], defaultMeal };
}
