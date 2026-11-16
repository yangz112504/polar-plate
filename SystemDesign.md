# Polar Plate: System Design Decisions

A personal learning log. Each entry: what we were deciding, the options, trade-offs, what we chose and why.
Newest decisions go at the bottom. Kept untracked on purpose (not committed).

---

## 1. Where the menu scrape happens, and how often
- **Problem:** `backend/routes/menu.js` launched a full headless Chromium on every page load.
- **Options:**
  - **A. Scrape in the browser / cache in localStorage.** Cons: scraping can't run in a browser (CORS), and localStorage only helps one browser.
  - **B. Scrape on every request (status quo).** Pros: always fresh, no storage. Cons: seconds per request, hundreds of MB, hammers Bowdoin's site.
  - **C. Scrape once per day on the server and store it (materialization).** Pros: fast reads, polite to the source, menus become data for history/stats. Cons: needs storage and a "when to refresh" rule.
- **Chosen:** C.
- **Concept:** *materialization*, caching.

## 2. When to refresh: cron vs get-or-scrape
- **Options:** (a) midnight cron job; (b) get-or-scrape on first request of the day (cache-aside), optionally pre-warmed by an external cron.
- **Trade-offs:** free-tier servers sleep, so a cron can silently not run; the site may publish late. Cache-aside needs a **single-flight lock** so simultaneous first requests don't all scrape (*cache stampede*).
- **Chosen:** get-or-scrape + single-flight lock (built in Step 1).

## 3. Redis cache?
- **Chosen:** not yet. ~6 small menus/day read from Postgres takes milliseconds. History, stats and comments need durable storage anyway. Add Redis only if measurements show a need.
- **Would differ at scale:** thousands of requests/second on hot data.

## 4. Dates: UTC vs Bowdoin's day
- **Bug:** `new Date().toISOString().slice(0,10)` is UTC; after ~7-8pm ET it is already "tomorrow".
- **Chosen:** one `dayKey()` helper (`America/New_York`, uses `Intl` so DST is handled by the platform), computed on the **server**; never trust a date sent by the client.

## 5. Database: Mongo vs Supabase Postgres
- **Options:** keep MongoDB; Postgres (Supabase).
- **Why Postgres:** the data is relational (users <-> meals <-> ratings); we'll want joins and aggregates (history, weekly best/worst, streaks) and database-enforced rules (UNIQUE, CHECK, foreign keys).
- **Chosen:** Supabase used as **managed Postgres** (+ Storage later). Express stays the only API. Own JWT auth for now (revisit Supabase Auth in Step 5).
- **Trade-off:** vendor dependence is small, because it's plain Postgres and we can move.

## 6. ORM: Drizzle
- **Options:** raw SQL; Prisma; Drizzle.
- **Chosen:** Drizzle + drizzle-kit migrations. Schema is TypeScript (typed queries), SQL stays visible (good for learning), light runtime.
- **Concept:** *migrations* = version-controlled structure changes; `drizzle/meta/*` is the tool's bookkeeping.

## 7. IDs: UUIDs
- **Options:** auto-increment integers vs UUIDs.
- **Chosen:** UUIDs (`gen_random_uuid()`). Pros: not guessable/enumerable, safe to create anywhere. Cons: bigger, not sortable by creation.

## 8. Menu items as JSONB on the meal row
- **Options:** normalized `menu_items` table vs JSONB.
- **Chosen:** JSONB `[{category, items[]}]`. We only ever read a whole menu; no per-dish queries yet. **Cost of changing later:** moderate (a migration + backfill) if dish-level features appear.

## 9. Data model: `users`, `meals`, `ratings`
- Ratings point at a `meals` row (identity) instead of loose `hall/meal/date` strings, so comments, favorites and stats can attach to the same meal.
- `meals` is also the daily menu cache. `UNIQUE (service_date, hall, meal_type)`.
- `ratings`: `UNIQUE (user_id, meal_id)`, `CHECK` score 0.5-5.0 in half steps.
- `meals.created_at` (not `scraped_at`): consistent naming; `items IS NULL` already means "not scraped yet". If we need scrape time, add a column in Step 1.
- `users.password` holds a bcrypt hash (named "password" by choice; commented in schema).

## 10. Race conditions: check-then-act vs atomic upsert
- **Problem:** `findOne` then `save` (old rating code) can create duplicates when two requests interleave (*TOCTOU*).
- **Options:** app-level lock; transaction with SELECT; **let the database arbitrate**.
- **Chosen:** UNIQUE constraint + one atomic `INSERT ... ON CONFLICT DO UPDATE` (rating) / `DO NOTHING` + select (meal). Tested with 10 concurrent calls.
- **Concept:** *idempotent upsert*; correctness enforced in the DB, not the app.

## 11. Layering: routes -> services -> repositories (dependency injection)
- **Problem:** `server.js` is a monolith mixing schemas, auth, routes.
- **Chosen:** repositories take a `db` argument (`createUserRepository(db)`), so tests use Docker Postgres and production uses Supabase; swapping databases touches one layer. Domain errors (`UserAlreadyExistsError`, `InvalidScoreError`) keep Postgres codes out of routes.
- **Trade-off:** a little more ceremony than calling the DB from routes; pays off at the next DB/cache change.

## 12. TypeScript: gradual migration
- **Options:** big-bang rewrite vs gradual (`allowJs`).
- **Chosen:** gradual; all new code TS, convert old files when a step touches them. Run via `tsx` (no build step).

## 13. Testing: Vitest, tests-first, real Postgres, one `tests/` folder
- **Vitest** over Jest: native TS/ESM, fast.
- **Real Postgres in Docker** (port 54329) vs an in-memory fake (PGlite) or mocks: tests exercise real constraints, upserts and concurrency. Cost: Docker must be running. Tests run one file at a time (they share a DB).
- **Test location:** next to code vs one folder. **Chosen:** one `backend/tests/` folder mirroring `src/` (you wanted everything in one place). Cost: must keep structure in sync.
- **Rule:** write tests first, watch them fail for the right reason, then implement (see CLAUDE.md).

## 14. Row-level security (RLS) on every table
- **Problem:** Supabase auto-exposes tables through a public REST API. With RLS off, anyone with the public key could read `users` (including hashes).
- **Chosen:** enable RLS with **no policies** = public API denied. Express connects as the DB owner, which bypasses RLS. Defence in depth.

## 15. Emails stored lowercased
- **Chosen:** lowercase on write and on lookup, so `A@x.edu` and `a@x.edu` are one account. Cost: original casing is lost (acceptable for emails).

## 16. Supabase connection: Session pooler
- **Options:** direct connection (IPv6 only on free tier), session pooler (port 5432), transaction pooler (6543, needs `prepare: false`).
- **Chosen:** session pooler. Works over IPv4 and behaves like a normal connection.

## 17. One-time Mongo -> Postgres migration: users only
- **Decisions:** keep the 120 users and their bcrypt hashes unchanged (nobody resets a password); **discard old ratings** (new rating system, loose strings, UTC dates); new UUIDs (old ObjectIds not needed since ratings dropped).
- **Design:** pure `planMigration` (easy to test) + transactional `migrateUsers` (all-or-nothing) + thin CLI. Idempotent (re-run skips existing), `--dry-run`, counts-only output so no emails/hashes reach the terminal.
- **Result (2026-11-12):** 120 read, 120 inserted; a re-run inserted 0 and skipped 120.
- **Gotcha:** old app used database `fansDB`, not Mongo's default `test`.
- **Cleanup (2026-11-16):** the script, its tests and the `mongoose` dev dependency were deleted once the data was in Postgres and Mongo was no longer used. The code is still in git history (`d53ef82`) if it's ever needed.

## 18. Moving routes onto Postgres: `createApp({ db, secretKey })` + supertest (done)
- **Problem:** `server.js` creates the app and starts listening in one file, so tests can't call it without a real server and the real Mongo.
- **Options:** (a) test against a running server over HTTP; (b) export an app *factory* that takes its dependencies (DB, JWT secret) and test it in-process with supertest; (c) mock the repositories in route tests.
- **Chosen:** (b). Same dependency-injection idea as the repositories (#11); real Postgres catches real bugs; (c) would only prove we called the mock.
- **Behaviour kept the same (Step 0 is a move, not a redesign):** URLs, request/response shapes, status codes and messages. The frontend still sends `hall`/`meal`/`date`; the route finds or creates the `meals` row. Server-side `dayKey` comes in Step 2.
- **Deliberate changes:** invalid input now returns 400 (bad date, non-numeric or out-of-range score, non-string fields) instead of a 500; GET routes never create meal rows (`findMeal` is read-only); old JWTs holding Mongo ObjectIds get 404 instead of crashing the DB query (users just log in again; same password).
- **Trade-off:** `listRatingsForMeal` now also returns the rating `id`, because the frontend uses `_id` as a React key.

## 19. Input validation: zod at the API boundary
- **Options:** hand-written `if (!x)` checks (what the old code did) vs a schema library (zod).
- **Chosen:** zod. One schema says what a valid body is (types, non-empty, real calendar date), and bad input becomes a 400 instead of a 500 or a surprising DB error. It also rejects objects such as `{"$ne": null}` where a string belongs (a classic injection trick against Mongo; harmless in Postgres but still a bug). The plan already named zod for the frontend forms, so we reuse the same library.
- **Trade-off:** one more dependency.

## 20. Where each concern lives (routes -> auth service -> repositories)
- `routes/*` parse input (zod) and shape responses; `auth/authService.ts` owns bcrypt + JWT; repositories own SQL. Only `app.ts` wires them together, and only `server.ts` reads env and starts listening.
- **Why:** each layer can be tested or swapped alone (for example Supabase Auth later touches `authService` only).
- **Errors:** domain errors (`UserAlreadyExistsError`, `LoginError`, `InvalidScoreError`) become 4xx in routes; anything unexpected reaches one app-wide handler that logs the details and returns a generic 500 (never leak internals).
- **Old `server.js` retired.** Mongoose was kept only for the one-time migration script and was removed together with it on 2026-11-16 (see #17).

## 21. Menu source: Bowdoin's JSON endpoint instead of scraping (Step 1a, chosen: design 2)
- **How we found it (2026-11-12):** the dashboard showed "HTTP 500" for menus. The old Playwright scraper waits for the elements `#u48` / `#u49`, but the live page now builds `#uthorne` / `#umoulton`, so it times out. Reading the page's own script (`/_files/js/dining-menu.js`) showed that Bowdoin's page does not scrape anything: it calls `https://dining-menu.bowdoin.edu/menu/<YYYY-MM-DD>/<thorne|moulton>/<meal>`, which returns JSON `[{course, course_sort, items:[{item, sort_order, ...}]}]`. One test request confirmed it works.
- **Options:** (1) fix the Playwright selectors; (2) call the JSON endpoint with `fetch`; (3) JSON plus a Playwright fallback.
- **Chosen: 2.** Why it is better:
  - **Lighter overhead:** no headless Chromium (hundreds of MB, seconds per request, a browser process to crash or leak) and no `playwright install` step on every machine or deploy. One small HTTPS request instead.
  - **More resilient:** the page's HTML is a presentation detail that the school redesigns at will (that is exactly what broke us). The JSON is the data the page itself is built from, so it changes far less often. Parsing JSON also means we read named fields instead of guessing at element ids and tag order.
  - **Politer:** a few small requests per day instead of loading a full page, scripts and images every time.
  - **Simpler to test:** the parser is a pure function of JSON; real responses are saved as fixtures.
  - Option 1 would break again at the next redesign; option 3 keeps all the Chromium cost for a fallback we would rarely use and have to maintain.
- **Cost / caveat:** it is an undocumented endpoint on the school's site and can change without notice. Mitigations: isolate it in one module, validate the shape of every response and fail loudly on a mismatch, send an honest User-Agent, use timeouts and retries.
- **What to show (agreed):** copy the courses Bowdoin's own page shows: Soup, Salads, Main Course, Starches, Vegetables, Display, Desserts, Deli, Grab and Go (anything else, such as "Salad Bar" or a course named "null", is hidden). If a course is missing that day, we simply don't show its header (they don't serve it); if it has items, we show the header and the items.
- **Error vs empty (agreed):** Bowdoin returns an error (network failure, timeout, 5xx) -> the user sees "Error fetching menus". Bowdoin returns an empty list -> "No menu found". These are different situations and must never be mixed up.

## 22. Concurrent requests and retries: single-flight, no cooldown (Step 1, chosen)
- **Problem:** several students open the app at the same moment, before today's menu is stored. Without protection every request calls Bowdoin (a *cache stampede*).
- **Options:**
  - **A. Nothing:** each request fetches. Simple, but N students = N calls, and an outage makes it worse.
  - **B. Single-flight (request coalescing):** keep a map of fetches currently running, keyed by (date, hall, meal). A request that arrives while one is running waits for the *same* result instead of starting its own. When it finishes (success or failure) the entry is removed.
  - **C. Single-flight + cooldown:** also remember a failure/empty result for a minute or more and answer instantly without calling Bowdoin.
- **Chosen: B.** It fixes the real problem (simultaneous requests) with a few lines (a `Map` of in-progress Promises). Waiters share the first request's outcome, including a failure; the first request has already retried with backoff, so repeating that immediately would only hammer the site. The next request *after* it finishes tries again, which is the "retry later" behaviour.
- **Why not C yet:** at about 120 users, an outage costs at most one retry series every few seconds. A cooldown adds timers and state that must be tested and explained. Add it if logs show Bowdoin being hit too often. At larger scale or on several servers, the in-progress map and any cooldown would move to shared storage (Redis or the database), because each server only knows about its own requests.
- **Owner's reasoning (agreed):** the owner proposed single-flight first (a second request waits for the first fetch instead of starting another); the one refinement is that waiting requests share the first request's *failure* too, rather than each retrying. Tests: 10 simultaneous requests -> one attempt per hall, all 10 get the same result or the same error.
- **Empty menu:** not stored permanently (menus can be posted late); it is simply fetched again on the next request, also coalesced.

## 23. Menu pipeline layout and what "no menu" looks like (Step 1)
- **Layers (each testable alone):** `parser.ts` (pure JSON -> categories, applies the course show-list, throws `MenuFormatError` on a changed shape) -> `menuClient.ts` (one HTTPS call, timeout, 3 attempts with backoff on network/5xx errors, honest User-Agent, `fetch` injected in tests) -> `menuService.ts` (get-or-fetch from the `meals` table + single-flight) -> `menuRoutes.ts` (`GET /api/menus/:meal`, same response shape as before, date from the server's `dayKey()`).
- **Finding:** when Bowdoin has no menu (unserved meal, far-future date) the endpoint answers **HTTP 404** `{"message":"Resource not found"}`, not an empty list. We treat 404 and `[]` as "no menu found" (shown as an empty menu, never stored), and everything else that fails as "Error fetching menus" (HTTP 502).
- **Partial results (owner's choice):** the two halls are independent. If one fails, the other is still returned and stored, and the response carries `errors: {Moulton: "unreachable" | "format_changed"}` (present only on failure) so the backend reports the *real reason* while the frontend can simply show "No menu found". Only when both halls fail does the route answer 502 "Error fetching menus" (with the same `errors`). This is *graceful degradation*: one broken source shouldn't take down the whole page. Retrying later re-fetches only the hall that failed.
- **Risk:** a 404 is also what a *changed URL* would return, so a site change could look like "no menu" forever instead of an error. Mitigation: log every 404 with its URL so it's noticed; revisit if it ever happens.
- **What is stored:** only non-empty menus, in `meals.items`. A stored menu is final for that day. Empty or failed fetches store nothing, so the next request tries again.
- **Old scraper removed (done):** `routes/menu.js`, the `playwright` dependency and the `postinstall` browser download are gone.

## 24. Meal tabs: the server says which tabs exist and which opens first (Step 2, chosen: A1)
- **Problem:** the browser clock picked the meal (`pickMeal()`), the choice never updated, and it jumped to "tomorrow" after 8 pm.
- **Options:** (A1) new endpoint `GET /api/menus/schedule` -> `{date, meals, defaultMeal}`; (A2) add those fields to `GET /api/menus/:meal` (circular: you must already know a meal to learn which meals exist); (A3) rewrite `pickMeal()` in the browser (wrong device clock = wrong tabs; rules untestable without a frontend test setup).
- **Chosen: A1.** *Single source of truth on the server.* The rules are one pure function `getSchedule(now)` (`backend/src/menus/schedule.ts`) tested at every boundary, weekends and both daylight-saving days.
- **Rules:** weekdays Breakfast (12a-10a) / Lunch (10a-5p) / Dinner (5p-midnight); weekends Brunch (12a-5p) / Dinner (5p-midnight). America/New_York via `Intl`. No next-day jump. The two hall tabs (Thorne, Moulton) are separate and unchanged; meal tabs are a second row, ordered left to right as the server lists them.
- **Trade-off:** one more request on page load. **At larger scale:** cache the response; it only changes at 10 am and 5 pm.

## 25. Ratings use the server's day, not a client date (Step 2, chosen: B1)
- **Problem:** the client sent `date` (built from UTC), so evening ratings landed on tomorrow, and the server trusted it. Also any `hall`/`meal` string created a `meals` row.
- **Options:** (B1) server ignores the client and uses `dayKey(now)`; (B2) POST sends a `mealId` from the schedule; (B3) client echoes the schedule date and the server checks it.
- **Chosen: B1.** Smallest change that fixes the bug. The date field is removed from the rating API entirely (POST body, `/user` query, stats query); the all-ratings route moved from `/:hall/:meal/:date` to `/:hall/:meal/all`.
- **Known trade-off:** someone who opens Dinner at 11:58 pm and submits at 12:01 am rates the *next* day's Dinner. Rare at ~120 users; B2 is the stricter fix if it ever matters.
- **Follow-up (code review):** a rating POST is only accepted for a meal the schedule serves that day (no Lunch on a Saturday, no Brunch on a weekday), checked against `getSchedule(now).meals`, so the tabs and what can be rated share one source of truth. GET routes create nothing, so unserved meals there just return empty results. `getSchedule` also takes its date from `dayKey` so there is one definition of "Bowdoin's day".
- **Also:** zod allow-lists (`hall`: Thorne/Moulton; `meal`: Breakfast/Brunch/Lunch/Dinner) so unknown values return 400 and create no rows.

## Planned / open
- Auth gaps (stale username in JWT, password change doesn't revoke tokens): Step 5 (`tokenVersion` or Supabase Auth).
- Favorites: `ratings.is_favorite` vs a `favorites` table, decided in Step 6.
- Avatars in object storage (Supabase Storage), never in the DB.
- Comments: validate with zod, rate limit, never `dangerouslySetInnerHTML`.
