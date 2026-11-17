const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Builds the page title: the hall comes first, then the meal.
 * @param hall Dining hall name, e.g. "Thorne".
 * @param meal Meal name, e.g. "Breakfast".
 * @returns e.g. "Thorne Breakfast".
 */
export function headerTitle(hall: string, meal: string): string {
  return `${hall} ${meal}`;
}

/**
 * Formats the server's 'YYYY-MM-DD' day as "Weekday, Month day" (e.g. "Monday, November 16").
 * Built from the parts instead of parsing a UTC instant, so the browser's time zone can never
 * shift the weekday by one.
 * @param isoDate A day in 'YYYY-MM-DD' form.
 * @returns The long, human-readable date.
 */
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Local-time constructor: the weekday of this calendar date is the same in every zone.
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}`;
}
