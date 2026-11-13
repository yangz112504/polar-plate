import type { MenuCategory } from "../db/schema";
import type { MealRepository } from "../meals/mealRepository";
import { MenuFetchError, MenuFormatError } from "./errors";

/** Why one hall's menu couldn't be loaded: Bowdoin unreachable/erroring, or its JSON changed shape. */
export type HallErrorReason = "unreachable" | "format_changed";

const HALLS = ["Thorne", "Moulton"] as const;
type Hall = (typeof HALLS)[number];

/**
 * Both halls' menus for one meal. An empty array means "no menu found" OR "failed to load" for that hall;
 * `errors` is present only when a hall failed and says which hall and why, so one bad hall
 * doesn't hide the other (partial results).
 */
export type DayMenu = {
  Thorne: MenuCategory[];
  Moulton: MenuCategory[];
  errors?: Partial<Record<Hall, HallErrorReason>>;
};

type HallResult = { menu: MenuCategory[]; error?: HallErrorReason };

/**
 * Builds the menu service: get-or-fetch (cache-aside) with single-flight.
 * A stored non-empty menu is returned without calling Bowdoin. Otherwise Bowdoin is called once,
 * even when many requests arrive together; those requests share the same result or the same failure.
 * @param deps.meals Meal repository (stores menus in `meals.items`).
 * @param deps.fetchMenu Function that gets one hall's menu from Bowdoin (injected for tests).
 */
export function createMenuService(deps: {
  meals: MealRepository;
  fetchMenu: (serviceDate: string, hall: string, mealType: string) => Promise<MenuCategory[]>;
}) {
  /** Fetches currently running, by "date|hall|meal". A second request for the same key joins the first. */
  const inFlight = new Map<string, Promise<HallResult>>();

  /** Does the real work for one hall: stored menu first, otherwise fetch and store. */
  async function load(serviceDate: string, hall: Hall, mealType: string): Promise<HallResult> {
    const stored = await deps.meals.findMeal(serviceDate, hall, mealType);
    if (stored?.items && stored.items.length > 0) return { menu: stored.items };

    try {
      const menu = await deps.fetchMenu(serviceDate, hall, mealType);
      // Empty means "nothing published yet" (menus can be posted late), so don't store it.
      if (menu.length > 0) await deps.meals.setMenuItems(serviceDate, hall, mealType, menu);
      return { menu };
    } catch (err) {
      if (err instanceof MenuFetchError || err instanceof MenuFormatError) {
        console.error(`Menu fetch failed for ${hall} ${mealType} ${serviceDate}: ${err.message}`);
        return { menu: [], error: err instanceof MenuFetchError ? "unreachable" : "format_changed" };
      }
      throw err; // unexpected (a bug or the database): let the route turn it into a 500
    }
  }

  /**
   * Single-flight wrapper. The join check comes BEFORE the stored-menu check inside `load`, so a request
   * arriving just after a fetch finished finds the stored menu instead of fetching again.
   */
  function loadOnce(serviceDate: string, hall: Hall, mealType: string): Promise<HallResult> {
    const key = `${serviceDate}|${hall}|${mealType}`;
    const running = inFlight.get(key);
    if (running) return running;
    // `.finally` removes the entry whether the fetch succeeded or failed.
    const promise = load(serviceDate, hall, mealType).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return {
    /**
     * @param serviceDate 'YYYY-MM-DD' (from dayKey()).
     * @param mealType 'Breakfast' | 'Brunch' | 'Lunch' | 'Dinner'.
     * @returns Menus for Thorne and Moulton.
     * A hall that fails is reported in `errors` (nothing saved for it) while the other hall is still returned.
     * @throws Only for unexpected errors (e.g. database down), not for Bowdoin failures.
     */
    async getMenus(serviceDate: string, mealType: string): Promise<DayMenu> {
      // Halls are independent, so load them in parallel. allSettled (not Promise.all) waits for BOTH,
      // so an unexpected error in one hall can't leave the other still writing to the database after we return.
      const settled = await Promise.allSettled(HALLS.map((hall) => loadOnce(serviceDate, hall, mealType)));
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
      const [thorne, moulton] = settled.map((r) => (r as PromiseFulfilledResult<HallResult>).value);
      const errors: DayMenu["errors"] = {};
      if (thorne.error) errors.Thorne = thorne.error;
      if (moulton.error) errors.Moulton = moulton.error;
      const result: DayMenu = { Thorne: thorne.menu, Moulton: moulton.menu };
      if (Object.keys(errors).length > 0) result.errors = errors;
      return result;
    },
  };
}
export type MenuService = ReturnType<typeof createMenuService>;
