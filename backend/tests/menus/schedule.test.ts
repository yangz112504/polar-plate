import { describe, expect, it } from "vitest";
import { getSchedule } from "../../src/menus/schedule";

const WEEKDAY = ["Breakfast", "Lunch", "Dinner"];
const WEEKEND = ["Brunch", "Dinner"];

// 2026-11-12 is a Thursday, 11-14 Saturday, 11-15 Sunday. New York is UTC-5 (EST) in November.
describe("getSchedule: weekday (Thursday 2026-11-12)", () => {
  it.each([
    ["00:00 ET", "2026-11-12T05:00:00Z", "Breakfast"],
    ["09:59 ET", "2026-11-12T14:59:00Z", "Breakfast"],
    ["10:00 ET", "2026-11-12T15:00:00Z", "Lunch"],
    ["16:59 ET", "2026-11-12T21:59:00Z", "Lunch"],
    ["17:00 ET", "2026-11-12T22:00:00Z", "Dinner"],
    ["23:59 ET", "2026-11-13T04:59:00Z", "Dinner"],
  ])("%s opens %s", (_label, iso, expected) => {
    const s = getSchedule(new Date(iso));
    expect(s.date).toBe("2026-11-12");
    expect(s.meals).toEqual(WEEKDAY);
    expect(s.defaultMeal).toBe(expected);
  });
});

describe("getSchedule: weekend (Brunch + Dinner)", () => {
  it.each([
    ["Saturday 00:00 ET", "2026-11-14T05:00:00Z", "2026-11-14", "Brunch"],
    ["Saturday 16:59 ET", "2026-11-14T21:59:00Z", "2026-11-14", "Brunch"],
    ["Saturday 17:00 ET", "2026-11-14T22:00:00Z", "2026-11-14", "Dinner"],
    ["Sunday 00:00 ET", "2026-11-15T05:00:00Z", "2026-11-15", "Brunch"],
    ["Sunday 17:00 ET", "2026-11-15T22:00:00Z", "2026-11-15", "Dinner"],
    ["Saturday 23:59 ET", "2026-11-15T04:59:00Z", "2026-11-14", "Dinner"],
  ])("%s opens %s", (_label, iso, date, expected) => {
    const s = getSchedule(new Date(iso));
    expect(s.date).toBe(date);
    expect(s.meals).toEqual(WEEKEND);
    expect(s.defaultMeal).toBe(expected);
  });

  it("Friday 23:59 ET is still a weekday Dinner (no jump to Saturday Brunch)", () => {
    const s = getSchedule(new Date("2026-11-14T04:59:00Z"));
    expect(s.date).toBe("2026-11-13");
    expect(s.meals).toEqual(WEEKDAY);
    expect(s.defaultMeal).toBe("Dinner");
  });

  it("Sunday 23:59 ET is still Sunday Dinner (no jump to Monday Breakfast)", () => {
    const s = getSchedule(new Date("2026-11-16T04:59:00Z"));
    expect(s.date).toBe("2026-11-15");
    expect(s.meals).toEqual(WEEKEND);
    expect(s.defaultMeal).toBe("Dinner");
  });
});

describe("getSchedule: uses New York time, not UTC", () => {
  it("03:30Z on Nov 12 is Wednesday 10:30pm ET: date 2026-11-11, weekday Dinner", () => {
    const s = getSchedule(new Date("2026-11-12T03:30:00Z"));
    expect(s).toEqual({ date: "2026-11-11", meals: WEEKDAY, defaultMeal: "Dinner" });
  });

  it("Saturday 02:00Z (Friday 9pm ET) is a weekday, not a weekend", () => {
    const s = getSchedule(new Date("2026-11-14T02:00:00Z"));
    expect(s.date).toBe("2026-11-13");
    expect(s.meals).toEqual(WEEKDAY);
  });
});

describe("getSchedule: daylight-saving changes", () => {
  // Spring forward: Sunday 2026-03-08, clocks jump 2:00 -> 3:00 (EST -> EDT).
  it.each([
    ["Sat 23:59 EST", "2026-03-08T04:59:00Z", "2026-03-07", "Dinner"],
    ["Sun 00:00 EST", "2026-03-08T05:00:00Z", "2026-03-08", "Brunch"],
    ["Sun 16:59 EDT", "2026-03-08T20:59:00Z", "2026-03-08", "Brunch"],
    ["Sun 17:00 EDT", "2026-03-08T21:00:00Z", "2026-03-08", "Dinner"],
  ])("spring forward: %s", (_label, iso, date, expected) => {
    const s = getSchedule(new Date(iso));
    expect(s.date).toBe(date);
    expect(s.defaultMeal).toBe(expected);
    expect(s.meals).toEqual(WEEKEND);
  });

  // Fall back: Sunday 2026-11-01, clocks go 2:00 -> 1:00 (EDT -> EST).
  it.each([
    ["Sun 00:00 EDT", "2026-11-01T04:00:00Z", "Brunch"],
    ["Sun 16:59 EST", "2026-11-01T21:59:00Z", "Brunch"],
    ["Sun 17:00 EST", "2026-11-01T22:00:00Z", "Dinner"],
  ])("fall back: %s", (_label, iso, expected) => {
    const s = getSchedule(new Date(iso));
    expect(s.date).toBe("2026-11-01");
    expect(s.defaultMeal).toBe(expected);
    expect(s.meals).toEqual(WEEKEND);
  });
});

describe("getSchedule: invariant", () => {
  it("the default tab is always one of the tabs", () => {
    for (let h = 0; h < 24 * 7; h++) {
      const s = getSchedule(new Date(Date.UTC(2026, 10, 9, h)));
      expect(s.meals).toContain(s.defaultMeal);
    }
  });
});
