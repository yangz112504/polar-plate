import { useEffect, useRef, useState } from "react";

/** Meal schedule from GET /api/menus/schedule. */
export interface Schedule {
  date: string;
  meals: string[];
  defaultMeal: string;
}

/**
 * Loads the server's meal schedule and keeps it fresh: when the user returns to the tab or window,
 * it asks again, and if the server's day has changed since the page loaded it calls `onNewDay`.
 * A failed refetch is ignored (the old schedule keeps working); only the first load can set `failed`.
 * Returning to a tab fires both the visibility and focus events, so only one request runs at a time.
 * @param baseUrl Backend base URL.
 * @param onNewDay Called when the server's day changes while the page stays open.
 * @returns The schedule (null until loaded) and whether the first load failed.
 */
export function useSchedule(
  baseUrl: string | undefined,
  onNewDay: () => void,
): { schedule: Schedule | null; failed: boolean } {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);
  // Refs so the long-lived listeners always see the latest values without re-subscribing.
  const knownDate = useRef<string | null>(null);
  const onNewDayRef = useRef(onNewDay);
  onNewDayRef.current = onNewDay;

  useEffect(() => {
    let active = true; // false after unmount: late responses are dropped
    let inFlight = false; // true while a request is running; extra triggers are ignored

    /** Fetches the schedule; `initial` marks the first load, which is allowed to report failure. */
    async function load(initial: boolean) {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`${baseUrl}/api/menus/schedule`);
        if (!res.ok) throw new Error(`HTTP error! status ${res.status}`);
        const data: Schedule = await res.json();
        if (!active) return;
        const changedDay = knownDate.current !== null && knownDate.current !== data.date;
        knownDate.current = data.date;
        setSchedule(data);
        if (changedDay) onNewDayRef.current();
      } catch (err) {
        console.error("Error fetching meal schedule:", err instanceof Error ? err.message : err);
        if (initial && active) setFailed(true);
      } finally {
        inFlight = false;
      }
    }

    /** Re-checks the day when the page becomes visible or the window regains focus. */
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      load(false);
    };

    load(true);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [baseUrl]);

  return { schedule, failed };
}
