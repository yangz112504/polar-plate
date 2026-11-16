# Polar Plate — Roadmap & Step 0 Plan

> Read `CLAUDE.md` first: plan together, tests first (TDD), get the owner's agreement before implementing.

## Status (as of 2026-11-16)
**Done and committed on branch `step0-foundations`** (commits `d53ef82` backend, `c555d47` frontend, then Step 2: `6a71e32`, `0ddca3b`):
- **Step 0 (foundations):** TypeScript + Vitest + Drizzle on Supabase Postgres (RLS on), repositories,
  `dayKey()`, auth service, zod-validated routes via `createApp()`, `server.js` retired. 120 Mongo users
  migrated (ratings discarded on purpose). Old ratings are gone; users log in with their old passwords.
- **Step 1 (daily menu pipeline):** menus come from Bowdoin's JSON endpoint
  (`https://dining-menu.bowdoin.edu/menu/<date>/<thorne|moulton>/<meal>`), not Playwright (removed).
  Cache-aside in `meals.items` + single-flight; a hall failure doesn't hide the other hall (partial results);
  frontend shows "No menu found". The old Playwright scraper had broken because the page's element ids changed.
- **Tests:** `cd backend && docker compose -f docker-compose.test.yml up -d && npm test` (186 passing at last run; 14 fewer than before because the Mongo migration tests were removed),
  `npm run typecheck`. Frontend has no tests yet.
- **Decision log:** `SystemDesign.md` entries #1-#25 (untracked, personal). Update it whenever a design decision is made.

**Not yet done / owner to-dos:**
- Branch `step0-foundations` is pushed to GitHub (public repo); no PR yet. `Plan.md`, `SystemDesign.md` and
  `run-all-tests.sh` are tracked and public (owner's choice; they contain no secrets).
- ✅ Supabase DB password rotated and `DATABASE_URL` updated in `backend/.env` (owner, 2026-11-16).
- **Still open:** the old `SECRET_KEY` and `MONGO_URI` from the Aug 2025 `backend/.env` are in public git
  history on `main`. Retire the Mongo database user/cluster, and make sure `SECRET_KEY` in `backend/.env` is a
  new value. Deleting the `MONGO_URI` line from `backend/.env` is also on the owner (Mongo is no longer used).
- Mongo removed from the project (2026-11-16): the one-time migration script, its tests and the `mongoose`
  dev dependency are deleted. The migration already ran (120 users); see `SystemDesign.md` #17.

**Step 2 (meal tabs): done, reviewed and committed** (`6a71e32` feature, `0ddca3b` review fixes).
- `GET /api/menus/schedule` -> `{date, meals, defaultMeal}` from the pure `getSchedule(now)` (weekday
  Breakfast/Lunch/Dinner, weekend Brunch/Dinner, 5 pm cutoff, America/New_York). Frontend renders a second
  row of meal tabs under the Thorne/Moulton tabs. Decisions in `SystemDesign.md` #24-#25.
- Ratings use the server's day (client `date` removed); POST only accepts meals served that day;
  all-ratings route is now `/api/ratings/:hall/:meal/all`.
- Verified (at the time of Step 2): backend 200 tests passing, typecheck, frontend lint + build, and a manual browser check by the owner.
- **Open from the code review:** a page left open past midnight ET keeps yesterday's tabs (refetch the schedule
  on window focus would fix it); the known B1 trade-off (rating just after midnight lands on the next day).
- **Design note for Step 4:** put the hall name before the meal name in the main header above the menu
  (e.g. "Thorne Breakfast"); decide how the two tab rows look.

**Next action: Step 3 (half-star ratings).** Per `CLAUDE.md`: start in plan mode, present 2-3 designs with
trade-offs, owner decides, then tests first. Agreed input: click the left or right half of a star (left half
of star 3 = 2.5), scores 0.5-5.0 in 0.5 steps, validated by the server and the DB (the DB CHECK and
`upsertRating` already allow half steps; the UI still offers whole stars 1-5 only).

---

## What the owner asked for (summary)
1. Scrape the Bowdoin menu **once per day** instead of on every page load, and store the result.
2. **Meal tabs** (Breakfast / Lunch / Dinner) that are always viewable and rateable, opening on a
   default tab based on the time: 12a–10a Breakfast, 10a–5p Lunch, 5p–11:59p Dinner.
3. **Half-star ratings.**
4. A **UI redesign**: Bowdoin theme, more readable, less plain, and not generic.
5. A **profile page**: avatar upload, change username, change password (current + new + confirm), bio.
6. **Rating history** on the profile (items, scores, highest and lowest), **favorites**, and **pinning**
   a favorite meal.
7. A **stats page**: best and worst meals of the week; today's B/L/D averages side by side.
8. A **streak counter** (consecutive days with at least one rating).
9. **Comments** on each meal, separate from ratings, with a length limit.
10. **Friends.**

## Agreed decisions
| Topic | Decision |
|---|---|
| Weekends | Tabs show **Brunch + Dinner** on Sat/Sun; weekdays show Breakfast / Lunch / Dinner |
| Half stars | **Click the left or right half** of a star (left half of star 3 = 2.5). Not double-click |
| First feature | **Daily menu pipeline**, preceded by a Step 0 foundation |
| TypeScript | **Gradual migration**: set up TS now (`allowJs`), convert files as steps touch them; all new code in TS; shared types `User` / `Meal` / `Rating` |
| Database | **Supabase used as managed Postgres (+ Storage later)**. Express stays the only API. Keep our own JWT auth for now (revisit Supabase Auth in Step 5) |
| DB library | **Drizzle ORM** (+ **drizzle-kit** for migrations) |
| IDs | **UUIDs** on every table (`gen_random_uuid()`) |
| Menu items | Stored as **JSONB** on the meal row |
| Data model | `users`, `meals`, `ratings` (join table), as shown below |

Defaults chosen but **not yet confirmed** with the owner (confirm when Step 0 starts):
- Tests run against **Postgres in Docker**. Docker is installed but the daemon wasn't running; the owner
  starts Docker Desktop. The alternative is PGlite, which needs no Docker.
- Existing Mongo data: **start fresh, or a one-time migration script**? Still to ask the owner.
- The owner creates the Supabase project and adds `DATABASE_URL` to `backend/.env`. Until then we build
  against local Postgres. Never read or print secrets.

---

## System design review (why the order is what it is)
1. **The scrape happens on the server, not in the browser.** `backend/routes/menu.js` starts a full
   headless Chromium on every request (seconds, hundreds of MB). localStorage would only help one
   browser. → Scrape once per day on the server and store the result (*materialization*).
2. **Redis isn't needed yet.** About 6 small menus a day; reading them from Postgres takes milliseconds.
   History, stats and comments need durable storage. Add Redis only if measurements show a need.
3. **Don't depend on a midnight cron.** Free tiers put the server to sleep, and the site may update late.
   → Use **get-or-scrape (cache-aside)**: the first request of the day scrapes. Add a **single-flight
   lock** to prevent a cache stampede. An optional external cron can pre-warm the cache.
4. **Bug: dates are UTC.** `new Date().toISOString().slice(0,10)` appears in `StarRating.jsx` and
   `DiningHallMenu.jsx`, so ratings after about 7–8 pm ET land on tomorrow. → One `dayKey()` helper in
   `America/New_York`, computed **on the server**. Never trust a date sent by the client.
5. **Ratings need a meal identity.** Today ratings are loose strings (`hall`, `meal`, `date`). → Use a
   `meals` table; ratings, comments and favorites refer to it.
6. **Race condition in rating saves (any database).** `findOne` then `save` (`server.js:140`) is a
   *check-then-act* (TOCTOU) race. Moving to Postgres doesn't fix it; SELECT-then-INSERT races in the
   same way. → `UNIQUE (user_id, meal_id)` plus one atomic upsert
   (`INSERT … ON CONFLICT (user_id, meal_id) DO UPDATE`), with a concurrency test. (Registration in
   `server.js:80` has the same race. Rely on the unique constraints on username and email.)
7. **Auth gaps, handled in Step 5.** The JWT holds `username` (stale after a rename), and a password
   change doesn't log out old tokens. A `tokenVersion` field, or Supabase Auth, solves both.
8. **`server.js` is a monolith.** → Layers: *routes → services → repositories* (the repository layer is
   the data access layer). Grow it one feature at a time, not as a big rewrite.
9. **Comments security.** React escapes text, so never use `dangerouslySetInnerHTML`. Validate every
   request body with zod (blocks NoSQL/SQL operator injection), add rate limiting and length limits, and
   let users delete or report comments.
10. **Avatars go in object storage** (Supabase Storage) with size and type limits, never in the DB.

---

## Roadmap (each step unlocks the next)
| # | Step | Why it comes here / what it unlocks |
|---|------|-------------------------------------|
| 0 | ✅ **Foundations**: TS setup (backend + frontend), Vitest, Drizzle schema (`users`, `meals`, `ratings`), repository layer, `dayKey()`, existing routes moved onto Postgres with unchanged behavior | Cheapest time to switch DBs is before new tables exist; every later step uses these |
| 1 | ✅ **Daily menu pipeline**: fix the scraper, fill `meals`, get-or-scrape service + single-flight lock | Fixes the cost problem; meals get real items |
| 2 | ✅ **Meal tabs + default tab by time**; weekend Brunch/Dinner; ratings use the server day + upsert | First thing that uses stored menus; correct rating data |
| 3 | **Half-star ratings** (0.5–5.0, step 0.5; validated by the server and the DB) | Finishes the core rating experience |
| 4 | **Design system + dashboard redesign** (Bowdoin tokens, typography, buttons; use the `frontend-design` plugin) | Comes before new pages, so they're built in the new style |
| 5 | **Profile basics**: username, password change, bio, avatar; auth fixes (#7) | Gives history, favorites and friends a home |
| 6 | **Rating history → favorites → pin to profile** | Ratings ⋈ meals; first "my data" view |
| 7 | **Stats page**: today's B/L/D side by side; best and worst meals of the week | Aggregations that grow out of history |
| 8 | **Streaks** | Distinct rating days per user via `dayKey` |
| 9 | **Comments per meal** | Attach to the meal identity; moderation and rate limits |
| 10 | **Friends** (requests, privacy) | Most complex; builds on everything above |

Each step: its own plan (2–3 designs with pros, cons and a recommendation) → tests first → the owner
agrees → implement → `/code-review` (+ `/security-review` for auth, comments and uploads).

---

## Agreed data model (Postgres via Supabase, defined in Drizzle)

```
users    -- one row = one account
  id            uuid PK default gen_random_uuid()
  username      text NOT NULL UNIQUE
  email         text NOT NULL UNIQUE
  password_hash text NOT NULL            -- bcrypt, as today
  created_at    timestamptz NOT NULL default now()

meals    -- one row = one hall's meal on one day (~6/day); also the daily menu cache
  id            uuid PK default gen_random_uuid()
  service_date  date NOT NULL            -- Bowdoin's day (America/New_York), from dayKey()
  hall          text NOT NULL            -- 'Thorne' | 'Moulton'
  meal_type     text NOT NULL            -- 'Breakfast' | 'Brunch' | 'Lunch' | 'Dinner'
  items         jsonb NULL               -- [{ category: string, items: string[] }]; null until scraped
  scraped_at    timestamptz NULL
  UNIQUE (service_date, hall, meal_type)

ratings  -- join table: one row = one user's score for one meal
  id            uuid PK default gen_random_uuid()
  user_id       uuid NOT NULL → users.id
  meal_id       uuid NOT NULL → meals.id
  score         numeric(2,1) NOT NULL    -- CHECK: 0.5 ≤ score ≤ 5.0 AND score*2 is a whole number
  created_at, updated_at timestamptz NOT NULL default now()
  UNIQUE (user_id, meal_id)              -- one rating per user per meal; re-rating = upsert
```
- **What "category / items" means:** the Bowdoin page groups food under headings (the `<h3>`
  elements = categories) with dishes under each (the `<span>` elements = items). The current scraper
  already produces `[{category, items}]` (`menu.js:94`), and that list is stored as-is in `items`.
- **How features read this data:** history = a user's ratings ⋈ meals; averages and best/worst of the
  week = `AVG(score)` grouped by meal; today side by side = the same, filtered to today; streak = the
  distinct days on which a user has ratings.
- **Growth:** about 2,200 meals/year; ratings in the hundreds of thousands per year at most. The UNIQUE
  constraints create the indexes these lookups need.
- **Later steps add through migrations:** `users.bio` and `avatar_url` (Step 5), favorites (Step 6:
  `ratings.is_favorite` vs a `favorites` table, decided then), plus `comments` and `friendships`.
- Postgres `numeric` comes back from the driver as a **string**; repositories must convert it to `number`.

---

## Step 0: detailed plan

### 0.1 Setup
- Create the branch: `git checkout -b step0-foundations`.
- In `backend/`:
  - Dependencies: `drizzle-orm`, `postgres` (postgres-js driver).
  - Dev dependencies: `typescript`, `tsx`, `vitest`, `drizzle-kit`, `@types/node` (+ `supertest` and
    `@types/supertest` when route tests are added).
  - `tsconfig.json`: `strict`, `allowJs`, `noEmit`, `module: "Preserve"`, `moduleResolution: "bundler"`.
    We run TS through `tsx` instead of compiling, which keeps the existing CommonJS `server.js` working.
  - Scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"db:generate": "drizzle-kit generate"`,
    `"db:migrate": "drizzle-kit migrate"`. Switch `dev`/`start` to `tsx` once `server.js` imports TS modules.
  - `docker-compose.test.yml`: `postgres:16` on port `54329`, db `polar_plate_test`, user/password
    `postgres` (local test values only, not secrets).
  - `vitest.config.ts`: `fileParallelism: false` (the tests share one DB); `globalSetup` runs the
    Drizzle migrations against `TEST_DATABASE_URL`, which defaults to the local Docker URL.
  - `drizzle.config.ts`: schema `src/db/schema.ts`, output `drizzle/`, dialect `postgresql`,
    `DATABASE_URL` from env.
- Frontend TS setup (`allowJs` tsconfig) can come in Step 2, when the first frontend file is converted.

### 0.2 Files to create
```
backend/src/db/schema.ts            -- Drizzle tables exactly as the data model above (+ inferred types)
backend/src/db/client.ts            -- createDb(url) → { db, close }  (infrastructure)
backend/src/lib/dayKey.ts           -- dayKey(now = new Date()): 'YYYY-MM-DD' in America/New_York
backend/src/users/userRepository.ts
backend/src/meals/mealRepository.ts
backend/src/ratings/ratingRepository.ts
backend/src/**/*.test.ts            -- tests next to the code
backend/test/globalSetup.ts         -- runs migrations
backend/test/resetDb.ts             -- TRUNCATE users, meals, ratings CASCADE (beforeEach)
backend/drizzle/0000_*.sql          -- generated by drizzle-kit (commit it)
```
Repositories use **dependency injection**: `createUserRepository(db)` returns an object of functions,
so tests pass in the test DB and production passes in Supabase. Write the stubs first (signatures +
TSDoc, bodies `throw new Error("Not implemented")`) so the tests compile and fail for the right reason.

### 0.3 Tests to write first (show these to the owner before implementing)
**`dayKey`** (pure, no DB):
- 2026-11-12T03:30Z (10:30 pm ET Nov 11) → `2026-11-11`. This is the UTC bug case.
- 2026-11-12T04:59Z → `2026-11-11`; 2026-11-12T05:00Z (midnight EST) → `2026-11-12`.
- Spring forward (Mar 8, 2026): 2026-03-08T04:59Z → `2026-03-07`; 2026-03-08T05:00Z → `2026-03-08`;
  2026-03-09T03:59Z → `2026-03-08`; 2026-03-09T04:00Z (midnight EDT) → `2026-03-09`.
- Fall back (Nov 1, 2026): 2026-11-01T03:59Z → `2026-10-31`; 2026-11-01T04:00Z → `2026-11-01`.

**userRepository:**
- `createUser` returns a UUID id, username, email and createdAt.
- `findUserById` / `findUserByUsername` / `findUserByEmail` → the user or `null`.
- A duplicate username or email → throws a domain error `UserAlreadyExistsError`, so routes don't need
  to know Postgres error codes.

**mealRepository:**
- `getOrCreateMeal(serviceDate, hall, mealType)` creates the row (items `null`) the first time and
  returns the same id the second time.
- Concurrent calls for the same key → exactly one row.

**ratingRepository:**
- `upsertRating({ userId, mealId, score })` inserts → `{ created: true }`; a second call updates the
  score → `{ created: false }`, still one row.
- **Concurrent** upserts for the same user and meal → exactly one row (the race fix from review #6).
- An invalid score (0, 5.5, 2.3) is rejected.
- `findUserRating(userId, mealId)` → the score as a **number**, or `null`.
- `getMealStats(mealId)` → `{ average: number | null, count: number }` (null/0 when unrated).
- `listRatingsForMeal(mealId)` → `[{ username, score }]` sorted by score, highest first.

Run them (`docker compose -f docker-compose.test.yml up -d && npm test`) and confirm they fail with
"Not implemented". **Stop and get the owner's agreement.**

### 0.4 Implement (after agreement)
- Implement `dayKey` (`Intl.DateTimeFormat` with `timeZone: 'America/New_York'`) and the repositories
  (Drizzle; upsert via `onConflictDoUpdate`; convert `numeric` to number; map unique violations
  (Postgres code `23505`) to `UserAlreadyExistsError`).
- Move `server.js` routes onto the repositories, keeping the **request/response shapes unchanged**
  (the frontend still sends `hall`/`meal`/`date`; the route resolves the meal with `getOrCreateMeal`).
  Remove Mongoose and `MONGO_URI` once nothing uses them.
- Optional: a one-time Mongo → Postgres migration script (only if the owner wants the old data kept).

### 0.5 Verify
- `npm test` and `npm run typecheck` in `backend/`. Report exactly which tests ran and their results.
- Manually: register, log in, rate a meal in the running app; confirm the rows appear in the DB.
  Run frontend `npm run lint` and `npm run build`.

---

## Step 1 preview: Daily menu pipeline
- **1a. Investigate first:** check the Bowdoin menu page's network tab for a JSON/XHR endpoint. If one
  exists, drop Playwright. Otherwise, record the new selectors and save real HTML as test fixtures.
  Then present 2–3 designs.
- **1b. Tests:** parser (fixture → `[{category, items}]`; "No Menu Available"; a changed structure →
  a clear error, never a saved empty menu); service (a cache hit doesn't scrape; a miss scrapes once;
  concurrent misses scrape once; a failure saves nothing); route validation.
- **1c. Implement:** `backend/src/menus/{parser,scraper,menuService,menuRoutes}.ts`, filling `meals`.
  Replace `routes/menu.js`. Timeouts, retry with backoff, polite scraping.

## Tooling notes
- `/code-review` and `/security-review` are built into Claude Code; run them at the end of each step.
- The `frontend-design` plugin helps at Step 4. `feature-dev` is optional; this file plays that role.
- Testing needs a framework (Vitest), not a skill.

## Unrelated issues noticed (mention, don't fix unless in scope)
- `DiningHallMenu.jsx:1` imports an unused `use`.
- `globals.css`: the Bowdoin color variables are only defined inside the dark-mode media query.
- The backend has unused dependencies (`puppeteer`, `puppeteer-core`, `chrome-aws-lambda`, `axios`,
  `express-session`) and a `menuScraper.py` (gitignored).
