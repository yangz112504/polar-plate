import type { MenuCategory } from "../db/schema";
import { MenuFetchError, MenuFormatError } from "./errors";
import { parseMenuResponse } from "./parser";

const MENU_BASE_URL = "https://dining-menu.bowdoin.edu/menu";
/** Identifies us honestly to Bowdoin's server, so they can see who is calling and why. */
const USER_AGENT = "polar-plate/1.0 (student dining menu app)";

/** Options mostly exist so tests can inject a fake `fetch` and a no-op `sleep`. */
export type FetchMenuOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Pauses between attempts; its length + 1 is the number of attempts. */
  backoffMs?: number[];
  timeoutMs?: number;
};

/** Marks a failure worth retrying (network error, timeout, 5xx, 429), as opposed to a permanent one. */
class RetryableError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Makes one HTTP attempt.
 * @returns The parsed JSON body, or null for HTTP 404 (Bowdoin has no menu published).
 * @throws RetryableError for network errors, timeouts, 5xx and 429; MenuFetchError for other 4xx;
 *   MenuFormatError if the body isn't JSON.
 */
async function attempt(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown | null> {
  // AbortController gives us a timeout: a hung connection would otherwise wait forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (cause) {
    throw new RetryableError(`Request to Bowdoin failed: ${(cause as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    // 404 means "no menu published". A changed URL would also 404, so log it to make that noticeable.
    console.warn(`Bowdoin menu returned 404 (no menu or changed URL): ${url}`);
    return null;
  }
  if (response.status >= 500 || response.status === 429) throw new RetryableError(`Bowdoin answered ${response.status}`);
  if (!response.ok) throw new MenuFetchError(`Bowdoin answered ${response.status}`);

  try {
    return await response.json();
  } catch {
    throw new MenuFormatError("Bowdoin's response was not valid JSON");
  }
}

/**
 * Fetches one hall's menu for one meal from Bowdoin's JSON endpoint.
 * Retries network errors, timeouts and 5xx responses with backoff; does not retry other 4xx.
 * @param serviceDate 'YYYY-MM-DD'.
 * @param hall 'Thorne' | 'Moulton'.
 * @param mealType 'Breakfast' | 'Brunch' | 'Lunch' | 'Dinner'.
 * @returns The parsed categories; an empty array when Bowdoin has no menu (HTTP 404 or an empty list).
 * @throws MenuFetchError if Bowdoin can't be reached after all attempts; MenuFormatError if the response shape is wrong.
 */
export async function fetchMenu(
  serviceDate: string,
  hall: string,
  mealType: string,
  options: FetchMenuOptions = {},
): Promise<MenuCategory[]> {
  const { fetchImpl = fetch, sleep = defaultSleep, backoffMs = [500, 1000], timeoutMs = 8000 } = options;
  const url = `${MENU_BASE_URL}/${serviceDate}/${hall.toLowerCase()}/${mealType.toLowerCase()}`;

  // This loop is the retry logic: it calls `attempt` repeatedly until it succeeds or runs out of backoffMs.
  for (let i = 0; ; i++) {
    try {
      const body = await attempt(url, fetchImpl, timeoutMs);
      return body === null ? [] : parseMenuResponse(body);
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err; // permanent failure or bad format: don't retry
      if (i >= backoffMs.length) throw new MenuFetchError(err.message, { cause: err });
      await sleep(backoffMs[i]); // exponential-style pause before the next try
    }
  }
}
