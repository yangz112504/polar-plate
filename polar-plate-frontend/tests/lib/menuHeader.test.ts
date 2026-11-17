import { describe, expect, it } from "vitest";
import { formatLongDate, headerTitle } from "@/lib/menuHeader";

describe("headerTitle", () => {
  it("puts the hall name before the meal name", () => {
    expect(headerTitle("Thorne", "Breakfast")).toBe("Thorne Breakfast");
    expect(headerTitle("Moulton", "Dinner")).toBe("Moulton Dinner");
  });

  it("works for the weekend meal", () => {
    expect(headerTitle("Thorne", "Brunch")).toBe("Thorne Brunch");
  });
});

describe("formatLongDate", () => {
  it("turns the server's YYYY-MM-DD into 'Weekday, Month day'", () => {
    expect(formatLongDate("2026-11-16")).toBe("Monday, November 16");
    expect(formatLongDate("2026-01-01")).toBe("Thursday, January 1");
  });

  it("handles a leap day", () => {
    expect(formatLongDate("2028-02-29")).toBe("Tuesday, February 29");
  });

  it("does not depend on the browser's time zone (no off-by-one day)", () => {
    // Built from the parts, not parsed as a UTC instant, so every zone gives the same weekday.
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14, the zone most likely to shift a UTC-parsed date
    try {
      expect(formatLongDate("2026-11-16")).toBe("Monday, November 16");
    } finally {
      process.env.TZ = original;
    }
  });
});
