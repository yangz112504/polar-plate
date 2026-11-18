/**
 * Avatar helpers: every user gets a circle with their first letter on a color that is picked from
 * their id, so the same person always looks the same and nothing is uploaded or stored (SystemDesign.md #30).
 */

/** A background color and the text color drawn on it. */
export type AvatarColors = { bg: string; fg: string };

/** Near-black from the theme (`--color-ink`); every background below keeps it readable (tests check 4.5:1). */
const TEXT = "#231F20";

/**
 * Light, warm backgrounds in the cream/brick family. They are light on purpose: the circle sits on the
 * brick-red header, so a dark circle would disappear there, and dark text on a light circle stays readable.
 */
const PALETTE: readonly AvatarColors[] = [
  { bg: "#F6F0E4", fg: TEXT }, // cream
  { bg: "#EBC99B", fg: TEXT }, // tan
  { bg: "#E8B4A8", fg: TEXT }, // terracotta
  { bg: "#C7D3A8", fg: TEXT }, // sage
  { bg: "#A9C4D0", fg: TEXT }, // harbor blue
  { bg: "#D5BCD4", fg: TEXT }, // heather
  { bg: "#F0D58C", fg: TEXT }, // maize
];

/**
 * Hashes a string to a 32-bit number (FNV-1a). Any stable, well-spread hash works; this one is tiny.
 * @param text The string to hash.
 * @returns An unsigned 32-bit integer; the same text always gives the same number.
 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The letter shown in the circle: the first character of the name, uppercased.
 * Uses `Array.from` so an emoji (two UTF-16 units) is kept whole instead of cut in half.
 * @param username The user's name; may be missing while it is still loading.
 * @returns One character, or "" when there is no name.
 */
export function avatarLetter(username: string | null | undefined): string {
  return Array.from(username ?? "")[0]?.toUpperCase() ?? "";
}

/**
 * Picks the circle's colors for a user.
 * @param userId The user's id (any string; "" is fine while loading and gives the first color).
 * @returns Background and text colors from the palette; the same id always gets the same pair.
 */
export function avatarColors(userId: string): AvatarColors {
  return PALETTE[hash(userId) % PALETTE.length];
}
