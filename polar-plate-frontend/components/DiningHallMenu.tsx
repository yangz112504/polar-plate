import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AllRatings from "@/components/AllRatings";
import BrickPattern from "@/components/BrickPattern";
import AverageRating from "@/components/AverageRating";
import PolarBearMark from "@/components/PolarBearMark";
import SegmentedTabs from "@/components/SegmentedTabs";
import StarRating from "@/components/StarRating";
import { formatLongDate, headerTitle } from "@/lib/menuHeader";
import { useSchedule } from "@/lib/useSchedule";

const HALLS = ["Thorne", "Moulton"];
/** How long after the last scroll event the section outlines stay visible. */
const SCROLL_QUIET_MS = 1000;

interface MenuCategory {
  category: string;
  items: string[];
}
/** Menu for one meal, keyed by hall name (GET /api/menus/:meal). */
type MenuMap = Record<string, MenuCategory[]>;
const EMPTY_MENU: MenuMap = { Thorne: [], Moulton: [] };

interface DiningHallMenuProps {
  /** Optional content for the right side of the brick header (e.g. the logout button). */
  headerRight?: ReactNode;
}

/**
 * The dashboard's main view. Owns which hall and meal are selected. The header, tab rows, average
 * and "Your rating" stay fixed on screen; only the menu sections (and the ratings list below them)
 * scroll, so on a phone the controls never move out from under the thumb.
 */
function DiningHallMenu({ headerRight }: DiningHallMenuProps) {
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;
  const [hall, setHall] = useState(HALLS[0]);
  // null means "use the server's default meal"; set when the user picks a tab.
  const [pickedMeal, setPickedMeal] = useState<string | null>(null);
  const [menuMap, setMenuMap] = useState<MenuMap>(EMPTY_MENU);
  const [menuLoading, setMenuLoading] = useState(true);
  const [average, setAverage] = useState(0);
  const [votes, setVotes] = useState(0);
  const [ratingsFailed, setRatingsFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts ratings requests so a slow, older response can't overwrite a newer one.
  const ratingsRequestId = useRef(0);

  // When the server's day rolls over while the page is open, go back to that day's default meal.
  const handleNewDay = useCallback(() => {
    setPickedMeal(null);
    setRefreshKey((k) => k + 1);
  }, []);
  const { schedule, failed: scheduleFailed } = useSchedule(frontEndUrl, handleNewDay);

  const meal = schedule ? (pickedMeal && schedule.meals.includes(pickedMeal) ? pickedMeal : schedule.defaultMeal) : null;
  const day = schedule?.date;

  // Reload the menu when the meal (or the day) changes.
  useEffect(() => {
    if (!meal) return;
    const currentMeal = meal; // a const keeps the type `string` inside the async function below
    // Ignore a response that arrives after the user already switched to another tab.
    let cancelled = false;
    async function fetchMenus() {
      setMenuLoading(true);
      setMenuMap(EMPTY_MENU);
      try {
        const res = await fetch(`${frontEndUrl}/api/menus/${encodeURIComponent(currentMeal)}`);
        // Read the body even on errors: the backend says which hall failed and why (for developers).
        const data = await res.json();
        if (data.errors) console.error("Menu errors by hall:", data.errors);
        if (!res.ok) throw new Error(data.error || `HTTP error! status ${res.status}`);
        if (!cancelled) setMenuMap(data);
      } catch (err) {
        console.error("Error fetching menus:", err instanceof Error ? err.message : err);
      } finally {
        if (!cancelled) setMenuLoading(false);
      }
    }
    fetchMenus();
    return () => {
      cancelled = true;
    };
  }, [meal, day, frontEndUrl]);

  /** Loads today's average and vote count for the selected hall and meal (the server picks the day). */
  const fetchRatings = useCallback(async () => {
    if (!meal) return;
    const requestId = ++ratingsRequestId.current;
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${frontEndUrl}/api/ratings/${encodeURIComponent(hall)}/${encodeURIComponent(meal)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      // A newer request started while this one was in flight (e.g. the user switched tabs): drop this result.
      if (requestId !== ratingsRequestId.current) return;
      setAverage(parseFloat(data.avgRating) || 0);
      setVotes(data.totalRatings || 0);
      setRatingsFailed(false);
    } catch (err) {
      if (requestId === ratingsRequestId.current) setRatingsFailed(true);
      console.error("Error fetching ratings:", err instanceof Error ? err.message : err);
    }
  }, [meal, hall, frontEndUrl]);

  useEffect(() => {
    setAverage(0);
    setVotes(0);
    setRatingsFailed(false);
    fetchRatings();
  }, [fetchRatings, day]);

  // Clear any pending scroll timer on unmount.
  useEffect(() => () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
  }, []);

  /** Shows the section outlines now and hides them again once scrolling has been quiet for a moment. */
  const handleScroll = () => {
    setScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), SCROLL_QUIET_MS);
  };

  const handleSubmitSuccess = () => {
    fetchRatings();
    setRefreshKey((k) => k + 1);
  };

  if (scheduleFailed) {
    return <div className="py-10 text-center text-ink-soft">Couldn&apos;t load today&apos;s meals. Please refresh.</div>;
  }
  if (!schedule || !meal) {
    return <div className="py-10 text-center text-ink-soft">Fetching today&apos;s menus...</div>;
  }

  const sections = menuMap[hall] ?? [];

  return (
    // h-dvh = the visible phone height (excludes the browser bars). On a very short window the
    // content area keeps a minimum height (440px) and the whole page scrolls instead of clipping. Layout copied from the
    // "1 Hubbard" canvas boards: one column on phones; from 1024px a left column (title, average,
    // your rating) beside the scrolling menu.
    <div className="flex h-dvh flex-col overflow-y-auto bg-cream">
      {/* Brick header: app name, log out, hall tabs */}
      <header className="relative flex-none bg-brick px-5 pt-4 text-cream lg:px-12 lg:pt-[18px]">
        <BrickPattern />
        <div className="relative mx-auto flex max-w-[1120px] flex-col gap-3.5 lg:gap-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 lg:gap-3">
              <PolarBearMark className="h-9 w-9 lg:h-11 lg:w-11" />
              <span className="font-heading text-xl font-extrabold lg:text-[26px]">The Polar Plate</span>
            </span>
            {headerRight}
          </div>
          <div className="lg:w-[360px]">
            <SegmentedTabs variant="folder" label="Dining hall" options={HALLS} value={hall} onChange={setHall} />
          </div>
        </div>
      </header>

      {/* Meal tabs */}
      <div className="flex-none border-b border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-3.5 lg:px-12">
          <SegmentedTabs label="Meal" options={schedule.meals} value={meal} onChange={setPickedMeal} />
        </div>
      </div>

      {/* Phone: title / menu / your rating stacked. Desktop: title and rating left, menu right. */}
      <div className="mx-auto grid min-h-[440px] w-full max-w-[1216px] flex-1 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12 lg:px-12">
        <div className="border-b border-line px-5 pb-3 pt-[18px] lg:col-start-1 lg:row-start-1 lg:border-b-0 lg:px-0 lg:pb-0 lg:pt-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brick lg:text-sm">
            {formatLongDate(schedule.date)}
          </p>
          <h1 className="mt-1.5 text-[40px] font-extrabold leading-[1.02] lg:mt-1.5 lg:text-4xl lg:leading-none">
            {headerTitle(hall, meal)}
          </h1>
          <AverageRating average={average} totalVotes={votes} failed={ratingsFailed} />
        </div>

        {/* The only part that scrolls. tabIndex lets keyboard users scroll it with the arrow keys. */}
        <div
          role="region"
          aria-label="Menu sections"
          tabIndex={0}
          data-scrolling={scrolling}
          onScroll={handleScroll}
          className="grid content-start gap-3 overflow-y-auto px-3.5 pb-6 pt-3.5
                     lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:grid-cols-2 lg:gap-6 lg:border-l lg:border-line lg:p-6"
        >
          {menuLoading ? (
            <p className="col-span-full py-6 text-center text-ink-soft">Fetching menu...</p>
          ) : sections.length === 0 ? (
            // Shown whether Bowdoin has no menu or the fetch failed (the console says which).
            <p className="col-span-full py-6 text-center text-ink-soft">No menu found</p>
          ) : (
            sections.map(({ category, items }) => (
              <section key={category} className="menu-section rounded-xl px-2 py-2.5 lg:rounded-[14px] lg:px-4 lg:py-3.5">
                <h2 className="mb-1.5 border-b-2 border-ink pb-1 text-xl font-semibold lg:mb-2 lg:pb-[5px] lg:text-[22px]">
                  {category}
                </h2>
                <ul className="text-base leading-[1.7] lg:text-[17px] lg:leading-[1.75]">
                  {items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </section>
            ))
          )}
          <div className="col-span-full">
            <AllRatings hall={hall} meal={meal} refreshKey={refreshKey} />
          </div>
        </div>

        {/* Fixed: your rating */}
        <footer className="bg-panel px-5 pb-[18px] pt-3.5 shadow-[0_-6px_12px_-8px_rgba(35,31,32,0.35)]
                           lg:col-start-1 lg:row-start-3 lg:mb-6 lg:rounded-2xl lg:p-4 lg:shadow-none">
          <StarRating activeTab={hall} meal={meal} onSubmitSuccess={handleSubmitSuccess} />
        </footer>
      </div>
    </div>
  );
}

export default DiningHallMenu;
