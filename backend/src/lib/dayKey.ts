/** Formatter reused across calls; 'en-CA' prints dates as YYYY-MM-DD. */
const nyDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns Bowdoin's calendar day (America/New_York) for an instant, as 'YYYY-MM-DD'.
 * Used instead of UTC dates so evening ratings don't land on "tomorrow".
 * Intl handles daylight-saving shifts, so we never do offset math ourselves.
 * @param now The instant to convert (defaults to the current time).
 * @returns The date string in New York local time.
 */
export function dayKey(now: Date = new Date()): string {
  return nyDateFormat.format(now);
}
