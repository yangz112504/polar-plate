import { describe, expect, it } from "vitest";
import { dayKey } from "../../src/lib/dayKey";

describe("dayKey (America/New_York)", () => {
  it.each([
    ["10:30pm ET is still the previous day (the UTC bug)", "2026-11-12T03:30:00Z", "2026-11-11"],
    ["one minute before midnight EST", "2026-11-12T04:59:00Z", "2026-11-11"],
    ["midnight EST", "2026-11-12T05:00:00Z", "2026-11-12"],
    ["spring forward: before midnight", "2026-03-08T04:59:00Z", "2026-03-07"],
    ["spring forward: midnight EST", "2026-03-08T05:00:00Z", "2026-03-08"],
    ["spring forward: end of day (EDT)", "2026-03-09T03:59:00Z", "2026-03-08"],
    ["spring forward: next midnight EDT", "2026-03-09T04:00:00Z", "2026-03-09"],
    ["fall back: before midnight", "2026-11-01T03:59:00Z", "2026-10-31"],
    ["fall back: midnight EDT", "2026-11-01T04:00:00Z", "2026-11-01"],
  ])("%s", (_name, iso, expected) => {
    expect(dayKey(new Date(iso))).toBe(expected);
  });
});
