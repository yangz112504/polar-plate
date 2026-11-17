import { describe, expect, it } from "vitest";
import { DOUBLE_CLICK_MS, formatScore, nextScore, type LastPress } from "@/lib/starScore";

/** Presses `star` at time `t` (ms) from the given state; returns the new state. */
const press = (state: { score: number; last: LastPress | null }, star: number, t: number) =>
  nextScore({ score: state.score, star, last: state.last, now: t });
const start = { score: 0, last: null as LastPress | null };

describe("nextScore: single and double clicks", () => {
  it("one press on star 3 rates 3", () => {
    expect(press(start, 3, 0).score).toBe(3);
  });

  it("a quick second press on the same star makes it a half star (2.5)", () => {
    const first = press(start, 3, 0);
    expect(press(first, 3, 200).score).toBe(2.5);
  });

  it("a third quick press goes back to the full star", () => {
    const second = press(press(start, 3, 0), 3, 200);
    expect(press(second, 3, 400).score).toBe(3);
  });

  it("a slow second press (1 s later) is just a new single click: still a full star", () => {
    const first = press(start, 3, 0);
    expect(press(first, 3, 1000).score).toBe(3);
  });

  it("the window is inclusive: exactly DOUBLE_CLICK_MS later counts, one ms more does not", () => {
    const first = press(start, 3, 0);
    expect(press(first, 3, DOUBLE_CLICK_MS).score).toBe(2.5);
    expect(press(first, 3, DOUBLE_CLICK_MS + 1).score).toBe(3);
  });

  it("pressing a different star right after is a fresh single click", () => {
    const first = press(start, 3, 0);
    expect(press(first, 4, 100).score).toBe(4);
  });

  it("double-clicking star 1 gives 0.5", () => {
    expect(press(press(start, 1, 0), 1, 100).score).toBe(0.5);
  });

  it("a saved rating (no previous press) is replaced by a full star on one click", () => {
    // Loaded rating 4, user taps star 4 once: stays 4, not 3.5.
    expect(nextScore({ score: 4, star: 4, last: null, now: 0 }).score).toBe(4);
  });

  it("a slow press then a quick one: the quick pair counts from the latest press", () => {
    const a = press(start, 3, 0);
    const b = press(a, 3, 2000); // slow: full star, restarts the window
    expect(press(b, 3, 2200).score).toBe(2.5);
  });
});

describe("formatScore", () => {
  it.each([
    [0, "0 / 5"],
    [3, "3 / 5"],
    [2.5, "2.5 / 5"],
    [0.5, "0.5 / 5"],
  ])("formats %s as %s", (score, text) => {
    expect(formatScore(score)).toBe(text);
  });
});
