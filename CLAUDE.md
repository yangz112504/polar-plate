# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"The Polar Plate" is a small app for rating Bowdoin dining hall meals. Users register or log in, see that day's menu for two halls (Thorne and Moulton), and rate each meal out of 5 and see other users' ratings. The repo has two independent npm projects with no workspace or root `package.json`:

- `backend/`: Express 5 API, MongoDB via Mongoose, JWT auth, Playwright scraper.
- `polar-plate-frontend/`: Next.js 15 App Router (JavaScript, not TypeScript), Tailwind 4, MUI, and a few Radix/shadcn-style utilities.

There are no tests in either project, and no test runner is configured.

## Commands

Backend (run from `backend/`):

- `npm install`: `postinstall` also runs `npx playwright install` to download Chromium for the menu scraper.
- `npm run dev`: starts the API with nodemon on `PORT` (default 5001).
- `npm start`: same, without nodemon. There is no lint or test script.

Frontend (run from `polar-plate-frontend/`):

- `npm run dev`: Next dev server with Turbopack on http://localhost:3000.
- `npm run build` / `npm start`: production build and server.
- `npm run lint`: `next lint` with the flat config in `eslint.config.mjs` (`next/core-web-vitals`).

Environment:

- Backend `.env` (gitignored) needs `MONGO_URI`, `SECRET_KEY` (JWT signing), and optionally `PORT`. The Mongo database name is hardcoded as `fansDB` in `server.js`.
- Frontend env file (e.g. `.env.local`, gitignored) needs `NEXT_PUBLIC_FRONTEND_URL`. Despite the name, this is the **backend API base URL** (e.g. `http://localhost:5001`), not the frontend's own URL. Every `fetch` in the frontend prefixes it.

## Architecture

### Backend: one API file plus a scraper route

- `backend/server.js` holds the Mongoose models (`User`, `Rating`), the JWT middleware `authenticateToken`, and all auth and rating routes. It mounts the menu router at `/api/menus`.
- `backend/routes/menu.js` is the scraper. `GET /api/menus/:meal` launches headless Chromium with Playwright, loads the Bowdoin dining menu page, clicks the meal tab, and reads two fixed element IDs (`#u49` for Thorne, `#u48` for Moulton). It parses `h3` category headers and `span` items into `{ Thorne: [{category, items}], Moulton: [...] }`. The scrape is live on every request. Nothing is cached, and the browser is closed in `finally`.
- The `Rating` document is keyed by `(user, hall, meal, date)`. One user has at most one rating per meal per date, and a second submit updates the existing document. The `date` field is a string produced by the frontend's `Date.toDateString()`, so changing that format breaks existing data.
- Average and vote counts are computed on each request with a Mongo aggregation (`$avg`, `$sum`), not stored. Averages are returned as strings from `toFixed(2)`.
- Auth is stateless. Login and registration return a JWT with a 7-day expiry, containing `userId` and `username`. `DELETE /api/sessions` does nothing server-side. Logout is purely the client deleting the token.

### Frontend: client-side auth and a single dashboard

- The JWT is stored in `localStorage` under `authToken`. There is no server session and no cookie.
- `components/withAuth.jsx` is a higher-order component that wraps protected pages. It checks that the token exists and that it isn't expired by decoding it with `jwt-decode`, and redirects to `/login` otherwise. The dashboard is wrapped with it. Pages that need the token themselves read `localStorage` directly.
- The main screen is `app/dashboard/page.jsx`, which renders `components/DiningHallMenu.jsx` with a Thorne/Moulton tab switch.
- `DiningHallMenu.jsx` decides which meal and which date to show. `pickMeal()` uses the local clock and the weekday to choose Breakfast, Lunch, Dinner, or Brunch. The cutoffs are 11:00, 17:00, and 20:00, with weekend and Friday/Sunday-evening rules. After 20:00 it advances the date to tomorrow. Any change to meal timing should be made here, and the backend has no equivalent logic.
- Child components: `StarRating` (submits and loads the user's own rating), `AverageRating`, and `AllRatings`. Each makes its own `fetch` calls to the backend with the bearer token. There is no shared API client or state store.

### Things that will bite you

- The menu scrape depends on the Bowdoin page's DOM IDs (`#breakfastl`, `#u48`, `#u49`, etc.). If the page changes, the scraper breaks silently into a 500.
- The scraper's `waitForSelector` and `networkidle` waits can take several seconds per request.
- `backend/.gitignore` lists `menuScraper.py`, but the server does not use it. The Python scraper is not part of the running app.
- `node_modules` directories are currently tracked in git. Don't stage them.
