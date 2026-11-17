/** Longest gap (ms) between two clicks on the same star that still counts as a double-click. */
export const DOUBLE_CLICK_MS = 400;

/** The most recent star press: which star and when (ms timestamp). */
export interface LastPress {
  star: number;
  time: number;
}

/**
 * Decides the new score after the user presses a star.
 *
 * One press on star N gives N. A second press on the same star within DOUBLE_CLICK_MS toggles
 * between N - 0.5 and N. A slow second press is simply a new single press (N). We time the clicks
 * ourselves (instead of the browser's `dblclick` event) so mouse, touch and keyboard behave the same.
 * `last` comes only from presses, never from a rating loaded from the server, so one tap on a saved
 * 4-star rating stays 4.
 *
 * @param input.score Current score (0 = none).
 * @param input.star The star pressed, 1-5.
 * @param input.last The previous press, or null if none yet.
 * @param input.now Current time in ms (passed in so tests need no real waiting).
 * @returns The new score and the press to remember for next time.
 */
export function nextScore(input: {
  score: number;
  star: number;
  last: LastPress | null;
  now: number;
}): { score: number; last: LastPress } {
  const { score, star, last, now } = input;
  const last2 = { star, time: now };
  const isQuickRepeat = last !== null && last.star === star && now - last.time <= DOUBLE_CLICK_MS;
  if (!isQuickRepeat) return { score: star, last: last2 };
  return { score: score === star ? star - 0.5 : star, last: last2 };
}

/** Formats a score for display, e.g. "2.5 / 5" or "3 / 5". */
export function formatScore(score: number): string {
  return `${score} / 5`;
}
