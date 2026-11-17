# Polar Plate

## Why
A dining hall menu + rating app: it scrapes dining hall menus, shows them per hall/meal/day, and lets
logged-in users rate meals. These are the starting features that were implemented a year ago. Expect new features to be added.
It is also a **learning project**: the owner is a junior engineer teaching
themselves system design and how to work well with agentic AI. Understanding matters more than speed.

## What (current stack — expect this to change)
- `backend/` — Node + Express 5, Postgres (Supabase) via Drizzle, JWT auth, menus fetched from Bowdoin's JSON endpoint.
  Entry: `backend/src/server.ts` (`src/app.ts` wires routes, auth service and repositories; schema in
  `src/db/schema.ts`; menu pipeline in `src/menus/`; tests in `backend/tests/`).
- `polar-plate-frontend/` — Next.js 15 (App Router) + React 19, Tailwind, MUI, react-hook-form + zod.
  Pages in `app/`, shared UI in `components/`.
- Backend and frontend are both TypeScript (only the `.mjs` tool configs are JS). Write new code in TypeScript.
- The database is Postgres on Supabase (Mongo is gone). Caching is an open decision (a Redis cache is
  possible). Don't hard-wire assumptions about either; isolate data access so a swap stays cheap.

## How
- Backend: `cd backend && npm run dev` (needs `.env` with `DATABASE_URL`, `SECRET_KEY`); tests: start Postgres with
  `docker compose -f docker-compose.test.yml up -d`, then `npm test`; typecheck with `npm run typecheck`.
- Frontend: `cd polar-plate-frontend && npm run dev`; lint with `npm run lint`.
- All tests at once: `./run-all-tests.sh` from the repo root. It runs the backend suite (and the frontend
  one once it defines a `test` script), keeps going if one fails, prints PASSED/FAILED/SKIPPED per suite,
  and exits nonzero if any failed. It never installs deps or starts Postgres — start the test DB first.
- No frontend test suite exists yet. When verifying a change, say exactly how you checked it. If a feature
  deserves tests, propose adding a test setup rather than silently skipping verification.
  New work follows the tests-first rules in "Testing: tests first (TDD)" below.

## Workflow: plan together, then build
1. For any non-trivial feature, we start in plan mode. Don't write code before the plan is agreed.
2. Present 2–3 viable designs. For each, list **pros, cons, and trade-offs** (complexity, cost,
   scalability, failure modes, how hard it is to change later), then give your recommendation and why.
   The owner decides.
3. Explain the *why* behind choices in plain language, and name the concept (e.g. "this is a cache-aside
   pattern") so it can be looked up. Flag where a decision would differ at larger scale.
4. If the request is ambiguous or a simpler approach exists, say so before implementing.

## Design log
- `SystemDesign.md` (untracked, personal learning notes) records each important design decision: the
  options we compared, their trade-offs, what we chose and why. Whenever we make or change a system
  design decision (database, schema, architecture, library, security, testing approach), add or update
  its entry in the same turn. Keep entries short and in plain language; never put secrets in it.

## Testing: tests first (TDD)
- Write the tests **before** the implementation. Tests define the expected behavior; the implementation
  is then written to make them pass. Never write tests after the fact that merely mirror what the code
  already does — that proves nothing.
- Derive tests from the agreed plan/requirements (inputs, outputs, edge cases, error cases), not from
  the implementation. Show the tests to the owner and get agreement before implementing.
- Run the tests and confirm they fail for the right reason before writing any implementation code.
- Then write the simplest implementation that makes them pass. If a test fails, fix the implementation,
  not the test. Only change a test if it is genuinely wrong, and say so explicitly and why.
- If no test setup exists yet for the area being changed, propose one as part of the plan first.
- Say exactly which tests were run and their results when reporting a change as done.

## Code expectations
- Every function gets a normal-length docstring (TSDoc/JSDoc): what it does, params, return value,
  and notable side effects or errors. Not a one-liner, not an essay.
- Add comments where the code isn't self-evident — explain *why*, not what. The owner must be able to
  read and understand everything you write; prefer clear code over clever code.
- Follow idiomatic practice for the stack: typed code with no `any` unless justified, thin Express
  routes with logic in separate modules, validated input at API boundaries, secrets only in env vars,
  async errors handled, and standard Next.js/React patterns.
- Scraping: be a polite client — prefer an official API or JSON endpoint over scraping, cache results,
  rate-limit and set timeouts, retry with backoff, and fail gracefully when the page structure changes.
  Keep selectors and parsing isolated so a site change touches one place.
- Keep changes small and scoped: only touch what the task needs, match existing style, and mention
  (DON'T FIX) unrelated problems you notice. Clean up anything your change leaves unused.
- Don't add features, abstractions, or configurability beyond what was agreed in the plan.
