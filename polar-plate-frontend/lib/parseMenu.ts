import { z } from "zod";

/** One menu station: a heading with its dishes. */
export type MenuCategory = z.infer<typeof categorySchema>;
/** One meal's menu, keyed by hall name. Every requested hall is always present. */
export type MenuMap = Record<string, MenuCategory[]>;

const categorySchema = z.object({ category: z.string(), items: z.array(z.string()) });

/**
 * Checks the shape of GET /api/menus/:meal before the page renders it, so a malformed response
 * shows "No menu found" instead of crashing. Each hall is checked on its own: a bad hall becomes an
 * empty list, and inside a hall a malformed category is dropped while the good ones are kept.
 * @param data The parsed JSON body (untrusted, any type).
 * @param halls The hall names the page needs.
 * @returns A map with an entry (possibly empty) for every name in `halls`; unknown keys are ignored.
 */
export function parseMenu(data: unknown, halls: string[]): MenuMap {
  // Arrays are objects in JS, but a top-level array is not the shape we expect.
  const body: Record<string, unknown> =
    typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const entries = halls.map((hall): [string, MenuCategory[]] => {
    const list = body[hall];
    if (!Array.isArray(list)) return [hall, []];
    return [hall, list.flatMap((c) => {
      const parsed = categorySchema.safeParse(c);
      return parsed.success ? [parsed.data] : [];
    })];
  });
  return Object.fromEntries(entries);
}
