import { describe, expect, it } from "vitest";
import { avatarColors, avatarLetter } from "@/lib/avatar";

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two #rrggbb colors (1 to 21). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** A made-up but uuid-shaped id; `n` makes ids differ. */
const fakeId = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${(n * 7919).toString(16).padStart(12, "0")}`;

describe("avatarLetter", () => {
  it("is the first character, uppercased", () => {
    expect(avatarLetter("zai")).toBe("Z");
    expect(avatarLetter("Alice")).toBe("A");
    expect(avatarLetter("_x")).toBe("_");
  });

  it("is an empty string for an empty or missing name", () => {
    expect(avatarLetter("")).toBe("");
    expect(avatarLetter(null)).toBe("");
    expect(avatarLetter(undefined)).toBe("");
  });

  it("keeps a whole emoji instead of half of its surrogate pair (older accounts may have odd names)", () => {
    expect(avatarLetter("😀smile")).toBe("😀");
  });
});

describe("avatarColors", () => {
  it("is deterministic: the same id always gets the same colors", () => {
    expect(avatarColors(fakeId(1))).toEqual(avatarColors(fakeId(1)));
  });

  it("returns #rrggbb background and text colors", () => {
    const { bg, fg } = avatarColors(fakeId(5));
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("spreads users over several colors (not all the same)", () => {
    const bgs = new Set(Array.from({ length: 200 }, (_, i) => avatarColors(fakeId(i + 1)).bg));
    expect(bgs.size).toBeGreaterThanOrEqual(4);
  });

  it("never picks a color pair with contrast below 4.5:1 (WCAG AA for text)", () => {
    for (let i = 1; i <= 500; i++) {
      const { bg, fg } = avatarColors(fakeId(i));
      expect(contrast(bg, fg), `${bg} on ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does not crash on an empty id (e.g. while the user is still loading)", () => {
    const { bg, fg } = avatarColors("");
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
