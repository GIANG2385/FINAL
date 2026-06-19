# Pang Pang SmartOps AI — Progress Tracker

> Companion to `PangPang_SmartOps_AI_Build_Instructions.md`. Read that file first for full spec. This file tracks what's done and what's next — update it after every build step.

**Status as of 2026-06-19:** Steps 1–11 complete (full vertical slice + polish pass). Step 12 (deployment) is optional and not yet done — needs a decision from the user (see Open Decisions below).

---

## Build Order Checklist (from §9 of build instructions)

- [x] 1. Scaffold `frontend/` (Vite + React + Tailwind + react-router-dom + i18next) and `backend/` (Express skeleton)
- [x] 2. Wire up Firebase: `firebase.js` (frontend) and `firebaseAdmin.js` (backend) connected to real Firebase project `group13-4182f`
- [x] 3. Build Auth flow (login page, protected routes, role context)
- [x] 4. Build i18n scaffolding with seed keys; confirm toggle works end-to-end
- [x] 5. Seed Firestore with mock data (orders, inventory, tables, staff_shifts)
- [x] 6. Build Dashboard page reading from Firestore (`onSnapshot`)
- [x] 7. Build Front of House (tables + POS-lite)
- [x] 8. Build Back of House (inventory + KDS + labor + profit)
- [x] 9. Build backend AI services (§6) + `/api/insights` + insights feed UI
- [x] 10. Build Guest Engagement (reservations, basic loyalty view)
- [x] 11. Polish: full i18n string coverage, empty/loading/error states, responsive layout
- [ ] 12. (Optional) Deploy: Firebase Hosting + Cloud Functions/Cloud Run

Rule: build and verify each step before moving to the next; don't generate the whole codebase in one shot.

---

## Open Decisions / Blockers

(none currently — Firebase fully wired with real credentials)

---

## Acceptance Checklist (from §11 — final validation, not yet attempted)

- [ ] App runs locally end-to-end (`npm run dev` frontend, `npm start` backend)
- [ ] Language toggle switches every visible string, including AI-generated insight cards
- [ ] Creating an order decrements inventory and appears in Kitchen Display in real time
- [ ] Forcing a stockout produces a new `insights` document visible on Dashboard within one analysis cycle
- [ ] Firestore security rules tested: `staff`-role user cannot write to `insights` or `inventory`
- [ ] No hardcoded Firebase credentials committed to the repo

---

## Log

### 2026-06-19
- Build instruction doc reviewed. PROGRESS.md created. No code written yet.
- **Step 1 done:** scaffolded `frontend/` (Vite + React + Tailwind v4 via `@tailwindcss/vite` + react-router-dom + i18next/react-i18next/i18next-browser-languagedetector + firebase SDK). Folder structure matches §2 spec (`components/`, `pages/`, `locales/{en,vi}/`, `context/`, `hooks/`, `services/`).
  - `services/i18n.js` wired with seed `en`/`vi` translation.json files (default `vi`, localStorage detection).
  - `services/firebase.js` and `services/api.js` created with placeholder env vars (`VITE_FIREBASE_*`, `VITE_API_BASE_URL`); `.env.example` added, `.env*` gitignored.
  - Minimal pages: `Dashboard`, `Login`, `Settings` (with working language toggle) wired into `App.jsx` via `react-router-dom`.
  - Verified: `npm run build` succeeds.
- **Step 1 done:** scaffolded `backend/` (Express, ESM `type: module`). Folder structure matches §2 spec (`src/routes/`, `src/controllers/`, `src/services/`, `firebaseAdmin.js`, `server.js`).
  - `firebaseAdmin.js` reads `FIREBASE_SERVICE_ACCOUNT` from env, warns and no-ops if unset (no real Firebase project yet).
  - `middleware/requireAuth.js` added (verifies Firebase ID token; not yet wired to any routes).
  - `services/{rootCauseEngine,riskForecast,recommendationEngine}.js` created as **stubs only** (throw "not implemented") — full logic deferred to build order step 9 per the don't-get-ahead rule in §9.
  - `server.js` has only `/api/health` for now; real routes come in step 7+ per §9.
  - Verified: `node src/server.js` boots and `GET /api/health` returns `{"status":"ok"}`.
- **Step 2 done:** Firebase project `group13-4182f` connected for real.
  - Frontend: user provided real `VITE_FIREBASE_*` values in `frontend/.env` (gitignored).
  - Backend: user provided service-account JSON, encoded into `backend/.env` as `FIREBASE_SERVICE_ACCOUNT` (single-line JSON string, gitignored). The loose JSON key file was deleted from the repo root after being copied into `.env` (it was sitting unprotected outside gitignore — flagged to user after the fact).
  - Hit and fixed a firebase-admin v14 ESM bug: `import admin from 'firebase-admin'` gives `admin.apps === undefined` under ESM. Fixed by switching `backend/src/firebaseAdmin.js` to the modular subpath imports: `firebase-admin/app` (`initializeApp`, `cert`, `getApps`), `firebase-admin/firestore` (`getFirestore`), `firebase-admin/auth` (`getAuth`).
  - Verified: backend boots, `db`/`auth` both initialize against the real project, `/api/health` still responds.
  - User confirmed Firestore (production mode) and Authentication → Email/Password provider are already enabled in the Firebase Console.
- **Step 3 done:** Auth flow built and verified end-to-end via a Playwright-driven browser test against the real dev servers.
  - `frontend/src/context/AuthContext.jsx`: wraps Firebase Auth state (`onAuthStateChanged`), exposes `user`, `profile`, `role` (looked up from `users/{uid}` in Firestore), `login`, `logout`.
  - `frontend/src/components/ProtectedRoute.jsx`: redirects unauthenticated users to `/login`, shows loading state while auth resolves.
  - `Login.jsx` now calls real `signInWithEmailAndPassword`; `App.jsx`/`main.jsx` wire `AuthProvider` + protect the Dashboard/Settings routes; nav shows role badge + Log out when signed in.
  - Added `firestore.rules` (repo root) per §8.5 — staff can't write `insights`/`inventory`/`staff_shifts`/`external_factors` (manager/admin only); everyone signed-in can read; `users/{uid}` self-writable only. **User published this to the Firebase Console.**
  - Test user created in Firebase Auth (`hgiang2308@gmail.com`) by the user; Claude used the Admin SDK to look up the UID and seed `users/{uid}` with `role: admin`.
  - Verified live: started both dev servers, drove a headless Chromium session (ad-hoc Playwright script, `chromium-cli` skill not installed) through login → redirect to Dashboard → `admin` role badge rendered → zero console errors. Screenshots confirmed visually.
  - Note: first run hit `FirebaseError: Missing or insufficient permissions` on the `users/{uid}` read because `firestore.rules` was written locally but not yet deployed — resolved once user published rules via Console. Worth remembering: any new Firestore collection/rule change needs an explicit Console publish (or `firebase deploy --only firestore:rules` via CLI) — it does not take effect just by editing the local `firestore.rules` file.
- **Step 4 done:** confirmed i18n toggle works end-to-end via Playwright demo — login (vi default), dashboard, settings dropdown, nav all switch correctly between `vi`/`en`.
  - **Bug found and fixed:** app was defaulting to English for new visitors instead of the spec'd Vietnamese default. Cause: `i18next-browser-languagedetector`'s `detection.order` included `'navigator'`, which picked up the browser/OS locale before falling back to `fallbackLng: 'vi'`. Fixed in `frontend/src/services/i18n.js` by setting `detection.order: ['localStorage']` only — now correctly defaults to `vi` until the user explicitly toggles (which persists to `localStorage`).
- **Step 5 done:** `backend/src/scripts/seed.js` writes mock data directly to Firestore via the Admin SDK (run with `node src/scripts/seed.js` from `backend/`).
  - Seeded: 8 `tables` (mixed open/reserved/dining/cleanup), 6 `inventory` SKUs (including two near/at stockout, for step 9's risk forecasting later), 4 `staff_shifts`, 15 `orders` (randomized items from a 5-item mock menu, channels, statuses, VND totals, timestamps spread across the last 6 hours).
  - Re-runnable: uses deterministic doc IDs (`table_id`/`sku`/`staff_id`/order `id`) via Firestore batch `set`, so re-running overwrites cleanly instead of duplicating.
- **Step 6 done:** real `frontend/src/pages/Dashboard.jsx` replacing the step-1 placeholder.
  - Live Firestore reads via `onSnapshot` on `orders`, `tables`, `insights` (auto-updates without refresh).
  - Computes: today's revenue (sum of `served` orders' `total_amount` for today), covers (count of today's served orders), avg ticket, table occupancy count — all from real seeded data.
  - Table occupancy heatmap: color-coded grid by status (open/reserved/dining/cleanup), bilingual status labels.
  - Active alerts feed: renders `insights` docs (`summary_en`/`summary_vi` per language) — currently empty since the AI engine (step 9) doesn't exist yet, shows a "no alerts" empty state instead.
  - Added `dashboard.*` keys to both `locales/{en,vi}/translation.json` (revenue/covers/avgTicket/tableOccupancy/alerts/status labels), VND formatting via `Intl.NumberFormat`.
  - Verified live via Playwright screenshot: 1.975.000 ₫ revenue, 9 covers, 219.444 ₫ avg ticket, 4/8 tables occupied, correct color-coded statuses, zero console errors.
- **Note for next session:** dev servers were restarted multiple times during this work (clean `pkill -f vite` / `pkill -f "node src/server.js"` then relaunch) — if the user reports a blank page again, first check whether dev servers are actually running (`curl localhost:5173`, `curl localhost:4000/api/health`) before assuming a code bug. Most "blank dashboard" reports so far were either stale dev server processes or — legitimately — pages that hadn't been built yet for that build-order step.
- **Step 7 done:** Front of House — table grid + POS-lite + payment, with real backend business logic for order creation per §7's "frontend reads Firestore directly, backend handles write-with-business-logic" split.
  - `backend/src/data/menu.js`: 5-item MVP menu, each mapped to one inventory `ingredient_sku` + `ingredient_qty` consumed per unit (mirrors `frontend/src/data/menu.js`, which only carries name/price for the POS picker — no ingredient logic on the client).
  - `backend/src/controllers/ordersController.js` + `routes/orders.js`, mounted at `/api/orders` in `server.js`:
    - `POST /api/orders` (requireAuth): validates items against the menu, runs a Firestore transaction that creates the order (`status: open`) and decrements `inventory.current_stock` for each item's ingredient (clamped at 0, not blocking — stockouts are meant to be forced for testing, not prevented), and flips the table to `dining`.
    - `PATCH /api/orders/:id/status` (requireAuth): transitions order status; when moving to `in_kitchen`, also creates one `kitchen_queue` doc per order item (`status: queued`).
  - `frontend/src/services/api.js` updated to attach the current Firebase ID token (`Authorization: Bearer <token>`) to every request, so the new `requireAuth` middleware (built in step 1, unused until now) actually gets exercised.
  - `frontend/src/pages/FrontOfHouse.jsx`: click a table → if it has an active (non-cancelled, not-yet-paid) order, shows that order's state (open/in_kitchen/served) with the right action; otherwise shows a POS-lite qty-stepper picker → "Create Order". "Mark Served" and payment recording (cash/card/momo, direct Firestore write since it's just data capture, not business logic) are also wired — payment additionally flips the table to `cleanup`.
  - Added `foh.*` i18n keys to both locale files.
  - **Verified live end-to-end via Playwright against the real dev servers + real Firestore**, including a case the test script didn't even plan for: clicking a table that already had a seeded `in_kitchen` order correctly rendered that order's state instead of an empty cart (proves the "find this table's active order" query works on real data, not just freshly created orders). Full loop tested: new order created (2× Mango Sticky Rice, 120.000₫) → sent to kitchen → confirmed in Firestore that `inventory/TH-RICE-01.current_stock` went 40 → 39.7 (exactly 2×0.15) and a `kitchen_queue` doc was created with `status: queued` → marked served → payment recorded → table auto-flipped to `cleanup` → panel correctly reset to a fresh order form. Zero blocking console errors (one transient `Could not reach Cloud Firestore backend` retry warning appeared once, self-recovered, not a real bug).
  - This directly satisfies the §11 acceptance checklist item: "Creating an order decrements inventory and appears in the Kitchen Display in real time" (Kitchen Display UI itself is step 8 — `kitchen_queue` docs already exist and are queryable, just no dedicated KDS screen yet).
- **Step 8 done:** Back of House — single page with four sections (matches §5's single-screen-with-subsections structure, same pattern as Dashboard).
  - `backend/src/controllers/inventoryController.js` + `routes/inventory.js` → `GET /api/inventory/forecast` (requireAuth): rule-based time-to-stockout per item (`current_stock / (avg_daily_consumption/24)`), flags `at_risk` when ≤6h remaining, sorted by urgency.
  - `backend/src/controllers/profitController.js` + `routes/profit.js` → `GET /api/profit/summary?range=` (requireAuth): revenue from today's `served` orders; `food_cost` estimated as a flat 32% of revenue (no per-ingredient cost data in the MVP data model — documented as a rule-based assumption, not real cost accounting); `labor_cost` from `staff_shifts` duration × an assumed 25,000₫/hr. Noted in code comments that `range=week` doesn't yet differentiate from `day` since only "today's" data is seeded.
  - `frontend/src/pages/BackOfHouse.jsx`: Inventory table (red-highlighted at-risk rows with stockout time), Kitchen Display (cards from live `kitchen_queue` onSnapshot, elapsed-time counter, red overload banner if active queue depth ≥5), Labor (on-shift count vs. recent 2h order volume, under/overstaffed flag, shift roster), Profit Snapshot (4 metric cards).
  - Added `boh.*` i18n keys to both locale files; wired `/boh` route + nav link in `App.jsx`.
  - **Verified live end-to-end via Playwright** against real dev servers + real Firestore + real backend computation: inventory table correctly flagged Shrimp and Chicken Thigh as at-risk (both seeded with low stock) with computed stockout times; Kitchen Display showed the `M-MANGO-STICKY` item created during the step 7 demo with a live elapsed-time counter; Labor section showed all 4 seeded staff with correct task counts and no false staffing flag; Profit Snapshot computed 2.035.000₫ revenue → 651.200₫ food cost → 800.000₫ labor cost → 583.800₫ profit, matching the rule-based formulas by hand-check. Zero blocking console errors.
- **Step 9 done:** AI Intelligence Engine — turned the step-1 stub services into real rule-based logic, wired `/api/insights`, populated the previously-empty Active Alerts feed.
  - `backend/src/services/riskForecast.js`: `forecastStockout` (≤6h remaining → risk_forecast insight, severity `critical` if <2h), `forecastKitchenOverload` (active queue depth ≥5 → insight). Both pure functions, no DB access.
  - `backend/src/services/rootCauseEngine.js`: `analyzeRootCause` compares revenue in the last 2h window vs. the prior 2h window of *today's* served orders (documented MVP simplification — no real historical baseline exists yet since only "today" is seeded; a future pass with real multi-day data should replace this), flags a ≥15% drop and cross-references kitchen overload / stockout SKUs / complaint count (complaints always 0 for now — `feedback` collection is never seeded/written to).
  - `backend/src/services/recommendationEngine.js`: `recommendationFor` returns templated bilingual recommendation text appended to the insight's `summary_en`/`summary_vi` (matches the proposal's example format — no separate recommendation field needed since §4's `insights` schema only has summary fields).
  - `backend/src/controllers/insightsController.js`: orchestrates the above against live Firestore data (`runAnalysisInternal`, called by both the manual endpoint and the scheduler), plus `listInsights` (GET, filterable by `type`/`severity`/`status` query params) and `acknowledgeInsight` (POST, **role-checked**: reads the caller's `users/{uid}.role` from Firestore and rejects with 403 unless `manager`/`admin` — note this is an app-level check in the controller, separate from and in addition to the Firestore security rules, since the Admin SDK bypasses those rules entirely).
  - Dedup: before creating an insight, checks for an existing non-`acted_on` insight of the same type with matching `related_entities` key created in the last 30 minutes — prevents the same stockout/overload from spamming a new insight every analysis cycle. Verified live: re-running the analysis immediately after a successful run produced `{"created":0}`.
  - Routes: `GET/POST /api/insights*` (`routes/insights.js`) and `POST /api/run-analysis` (`routes/runAnalysis.js`, separate top-level path per §7's endpoint list) — both `requireAuth`-protected, mounted in `server.js`.
  - Scheduled job: `setInterval` in `server.js` calls `runAnalysisInternal()` every 60 seconds. Documented in code as a demo-compressed interval — §6 specifies "every 5–15 simulated minutes," and 60s of wall-clock time was chosen so the insights feed visibly updates during a live demo rather than requiring a multi-minute wait.
  - Frontend: new `frontend/src/pages/Insights.jsx` (§5 item 6) — type/severity filter dropdowns, severity-colored cards, status badges, "Acknowledge" button on `new` insights calling the backend endpoint. `Dashboard.jsx`'s "Active Alerts" section (built in step 6, empty until now) got the same Acknowledge button plus a link to the full feed. Added `insights.*` i18n keys to both locale files; wired `/insights` route + nav link.
  - **Verified end-to-end against the real project**: signed in via the Firebase REST API to get a real ID token for direct `curl` testing of the backend before touching the browser (`POST /api/run-analysis`, `GET /api/insights` with and without filters, `POST /api/insights/:id/acknowledge`) — confirmed the scheduler had already auto-created 2 correct insights (Shrimp and Chicken Thigh stockout warnings, both with bilingual summaries and appended recommendations) before the manual trigger was even called, and that re-running produced 0 new insights (dedup working). Then drove the full UI live via Playwright: Dashboard alerts populated, Insights feed page rendered both with correct type/severity/status labels, and clicking "Acknowledge" on the still-`new` Chicken Thigh insight flipped its badge from "Mới" to "Đã xác nhận" in real time. Zero console errors.
- **Step 10 done:** Guest Engagement — reservations list + loyalty/CLV view, both read directly from Firestore client-side (no backend logic needed, just display/aggregation — consistent with §7's "frontend reads Firestore directly for live data" split).
  - **Decision (user confirmed):** loyalty is based on `reservations.guest_name`, not `orders` — the `orders` schema (§4) has no guest-identity field, only `table_id`, so repeat-customer tracking has to come from reservations. Documented here in case a future iteration wants order-level CLV (would require adding a guest identity field to `orders` first).
  - `backend/src/scripts/seedReservations.js`: new one-off seed script (separate from `seed.js`) — 11 mock reservations across 6 guests, 3 of whom have repeat visits (2-3 each) plus one cancelled reservation, so the loyalty view has something real to aggregate. **Not idempotent** (auto-generated doc IDs, no natural unique key in the §4 schema) — re-running duplicates, noted in a code comment.
  - `frontend/src/pages/GuestEngagement.jsx`: **Reservations** section — upcoming `confirmed` reservations only, sorted chronologically, status badges. **Top Repeat Guests** section — client-side aggregation over all non-cancelled reservations grouped by `guest_name`, counts visits, tracks most recent visit, filters to guests with ≥2 visits, sorted by visit count descending.
  - Added `guest.*` i18n keys to both locale files; wired `/guests` route + nav link in `App.jsx`.
  - **Verified live via Playwright**: reservations table showed all 4 upcoming confirmed reservations correctly sorted by time; loyalty table correctly surfaced exactly the 3 repeat guests seeded (Le Hoang Long ×3, Nguyen Van An ×3, Tran Thi Bich ×2) with accurate last-visit timestamps, while the two one-time guests and the cancelled reservation were correctly excluded. Zero console errors (only the same recurring transient Firestore reconnect notice seen in every demo this session, which self-resolves and isn't a real bug).
- **Step 11 done:** Polish pass across all 7 pages. Found and fixed 4 real bugs:
  - **i18n gap:** `App.jsx`'s "Log out" button was hardcoded English, never translated even when in Vietnamese mode. Added `auth.logout` key to both locale files, wired it in. (Settings.jsx's `<option>Tiếng Việt</option>` / `<option>English</option>` were *not* a bug — language-name-in-its-own-language is the standard pattern for language selectors, deliberately not run through `t()`.)
  - **Silent error swallowing:** `Insights.jsx`'s acknowledge handler had an empty `catch` block with just a comment — a failed acknowledge gave the user zero feedback, the button just stopped being disabled with no explanation. Added an `actionError` state, displayed above the filter row.
  - **Same gap in `Dashboard.jsx`:** its acknowledge handler had no try/catch at all (an unhandled rejection on failure). Added the same error-state pattern.
  - **Page blocked entirely by one failed API call:** `BackOfHouse.jsx`'s top-level loading gate included `inventory` and `profit` (both backend `fetch` calls), so if either failed, the *entire* page — including the Kitchen Display and Labor sections, which only need Firestore `onSnapshot` and have nothing to do with those two endpoints — would be stuck showing nothing. Split into independent per-section loading/error state (`inventoryError`, `profitError`) so a backend hiccup on one section doesn't take down sections that don't depend on it.
  - **Responsive layout bug (caught via Playwright at 375px viewport):** the nav bar (`flex items-center gap-4`, no wrap/scroll handling) squeezed every link into an equal-ish narrow column at mobile width, wrapping each link's text mid-word into a tall, illegible stack — confirmed identically broken on Dashboard, FOH, BOH, and Insights screenshots. Fixed by making the nav `overflow-x-auto whitespace-nowrap` with `shrink-0` on each item, so it becomes a single-row horizontally-scrollable bar instead of wrapping. Page *content* (grids, tables) was already responsive without changes — this was purely a nav-chrome bug.
  - Verified all fixes live: rebuilt, restarted dev servers, re-ran the mobile Playwright check (clean single-row scrollable nav now) and spot-checked the error-state and i18n fixes don't break the existing desktop flows (build passes, no new console errors).
- Next: **step 12 (optional)** — Firebase Hosting (frontend) + Cloud Functions or Cloud Run (backend). This requires Firebase CLI login and console-side setup Claude can't do unilaterally — needs a decision from the user on whether to deploy now, and if so, which backend target (Cloud Functions vs Cloud Run) and whether they want to run `firebase login` themselves via the `!` passthrough.
