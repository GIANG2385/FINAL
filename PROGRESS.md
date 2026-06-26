# Pang Pang SmartOps AI — Progress Tracker

**Status as of 2026-06-26:** All 11 build steps complete. App deployed to Vercel (`https://final-wine-five.vercel.app`) + backend on Render (`https://pang-pang.onrender.com`). Full Supabase migration complete. Dashboard fully redesigned with sidebar layout, floor plan, guest tracking, and AI card. UI polish pass complete across all pages. Revenue seed script ready for demo busy-scenario.

---

## Build Order Checklist

- [x] 1. Scaffold frontend (Vite + React + Tailwind + i18next) and backend (Express)
- [x] 2. Firebase: `firebase.js` (frontend) + `firebaseAdmin.js` (backend) → project `group13-4182f`
- [x] 3. Auth flow (login, protected routes, role context)
- [x] 4. i18n scaffolding — VI/EN toggle verified end-to-end
- [x] 5. Seed Firestore (orders, inventory, tables, staff_shifts)
- [x] 6. Dashboard — live `onSnapshot` reads, KPI cards, alerts feed
- [x] 7. Front of House — table grid + POS-lite + payment
- [x] 8. Back of House — inventory forecast + kitchen display + labor + profit
- [x] 9. AI Intelligence Engine — rule-based insights, `/api/insights`, scheduler
- [x] 10. Guest Engagement — reservations + loyalty view
- [x] 11. Polish — full i18n coverage, error/loading states, responsive nav
- [ ] 12. (Optional) Backend deployment to persistent host (Render/Railway/Fly.io)

---

## Open Decisions / Blockers

- **Firestore free-tier quota (Spark plan, 50K reads/day)** exhausted repeatedly. Resets at **midnight Pacific Time = 14:00 Vietnam time**. Check Firebase Console → Firestore → Usage tab before retrying scripts — do not rely on local date change.
- **June demo data not yet loaded.** Scripts are written and ready; blocked on quota. After quota resets, run in order:
  1. `node backend/src/scripts/resetJuneData.js` ← deletes old data, resets tables
  2. `node backend/src/scripts/generateJuneData.js` ← writes 1,560 orders + 210 reservations
  3. `node backend/src/scripts/computeHistoricalBaseline.js` ← recomputes revenue baseline
- **Backend has no deployed host.** All previously backend-dependent features (profit summary, inventory forecast, order creation) have been rewritten to use Firestore directly from the browser. The only remaining backend-only features are: AI Consultant (Cohere API calls, conversation storage), Insights engine (60s scheduler + rule-based analysis), and `acknowledge` endpoint. These require a persistent-process host (not Vercel serverless) if deployed.

---

## Architecture Notes

- **AI Consultant:** Cohere API (`command-a-03-2025`), not OpenAI. Free tier key in `backend/.env`. Conversation persisted to `consultant_conversations/{uid}/messages`. Manager/admin only.
- **No backend calls from frontend for data:** all reads/writes go directly to Firestore SDK. `VITE_API_BASE_URL=http://localhost:4000` is only used for AI Consultant messages and insights acknowledge — these fail gracefully in production (Consultant shows error, Dashboard acknowledge silently catches).
- **Historical baseline:** precomputed into `analytics/historical_baseline` by `computeHistoricalBaseline.js`. Used by profit controller and AI Consultant for "vs typical" comparisons.
- **Firestore security rules:** published live. All signed-in users (staff/manager/admin) can read/write all operational collections. AI Consultant (`consultant_conversations`) is manager/admin only. Dashboard route is manager/admin only — staff are redirected to `/foh` on login.

---

## Current Data Model (June 2026 target)

| Parameter | Value |
|---|---|
| Tables | T01–T08 (capacity 2–6) |
| Sessions | Lunch 11:00–14:00 · Dinner 18:00–22:00 |
| Channels | `dine_in` + `takeaway` only (own delivery, no third-party) |
| Occupancy | 70% · avg dining time 60 min |
| Orders | ~52/day · 1,560 total (June 1–30) |
| Revenue | ~270M VND/month |
| Reservations | ~210 (dine-in guests, 90% confirmed) |

---

## Acceptance Checklist (§11)

- [x] App runs on Vercel (frontend)
- [x] Language toggle switches every visible string (VI/EN pill in navbar)
- [x] Creating an order saves to Firestore and updates table status in real time
- [x] Table grid shows elapsed dining time badge from real `seated_at` field
- [x] Firestore security rules published
- [x] No hardcoded Firebase credentials in repo
- [ ] June demo data loaded (blocked on quota)
- [ ] AI Consultant verified with real Cohere reply on production URL
- [ ] Backend deployed to persistent host

---

## Log

### 2026-06-19 to 2026-06-21 (summarised)

Steps 1–11 completed in full. Key milestones:
- Firebase Auth + Firestore connected to real project `group13-4182f`
- FOH POS-lite: order → kitchen → served → payment, full lifecycle verified via Playwright
- BOH: inventory forecast, kitchen kanban, labor roster, profit snapshot
- AI Intelligence Engine: rule-based stockout/overload/revenue-drop insights, 60s scheduler
- Guest Engagement: reservations + loyalty aggregation from reservations
- AI Consultant: built with OpenAI → switched to Cohere after billing issues; fully verified with real LLM reply grounded in live Firestore data
- 10,000-order historical dataset loaded (Jan–May 2026); `analytics/historical_baseline` precomputed (avg 31M VND/day across 152 days)
- Firestore quota exhausted multiple times from unfiltered full-collection scans; fixed by scoping all queries with `where('created_at', '>=', cutoff)` server-side filters and caching the historical baseline as a single doc (1 read vs 10k)
- Dashboard revenue range toggle (today/week/month) with historical comparison line
- FOH bill clarity: order panel styled as a bill with status badge + payment confirmation screen

### 2026-06-25 (continued — post-brand)

**Pang Pang brand redesign + full UI restructure**

CSS custom properties in `index.css`:
- `--pp-primary: #E8002A` (chili red), `--pp-page-bg: #FFF8D6` (warm yellow), `--pp-navbar-bg: #1A1A1A` (dark black)
- Full token set: success/warning/danger/info/neutral/gold/silver/bronze status colors

`App.jsx`: dark sticky navbar, NavLink active = bold + red underline, VI/EN language toggle pill

`Dashboard.jsx`: removed table grid; KPI cards (revenue range toggle, covers, avg ticket, occupancy); red AI summary card; alerts deduplicated by summary+type, capped at 3

`FrontOfHouse.jsx` → 3 tabs:
- **Tables**: color-coded grid, elapsed time badge from real `seated_at` (AVG = 60 min), active order status per table, POS order panel
- **Orders**: kitchen kanban (pending / in-kitchen / completed) from `kitchen_queue` Firestore collection, shows table_id + item name + qty + elapsed time
- **Reservations**: AI peak forecast banner, add-reservation form, reservation list

`BackOfHouse.jsx` → 3 tabs:
- **Inventory**: Firestore `inventory` collection + inline +/- stock update (local state), stockout forecast computed client-side
- **Labor**: staff table with shift times, on/off badge, staffing flag, AI forecast banner
- **Supply & Revenue**: profit snapshot (computed from Firestore), channel breakdown (static), supplier reliability table

`GuestEngagement.jsx`: loyalty-only (reservations moved to FOH tab); Gold/Silver/Bronze tier pills using brand token variables

`Consultant.jsx`: chili-red user bubbles (rounded 18px), white AI bubbles with 🤖 avatar, red quick-prompt chips, red send button, typing dots animation

`Settings.jsx`: language card + tip note about navbar VI/EN toggle

**Bug fixes**

1. Blank page: `useMemo` dep array referenced `allOrders` (undefined after rename to `rawOrders`) — fixed to `rawOrders`
2. Revenue/inventory "something went wrong": `VITE_API_BASE_URL=http://localhost:4000` baked into Vercel build caused all `/api/*` calls to hit localhost. Fixed by computing profit and inventory forecast **directly from Firestore** client-side using same math as backend controllers:
   - `Dashboard`: 30-day `rawOrders` snapshot → filter by range client-side → `rangeRevenue`
   - `BackOfHouse`: `orders` + `staff_shifts` → profit memo; `inventory` collection → stockout forecast memo
3. FOH orders not saving: `handleCreateOrder`, `handleSendToKitchen`, `handleMarkServed` all called Express backend (`localhost:4000`). Replaced with direct Firestore writes:
   - Create order: `runTransaction` → sets `orders/{id}` + updates `tables/{id}` status to `dining`
   - Send to kitchen: `updateDoc` order + `writeBatch` one `kitchen_queue` doc per line item (includes `table_id`, `item_name_vi/en`, `qty`)
   - Mark served: `updateDoc` with `served_at: serverTimestamp()`
   - Record payment: `writeBatch` — order `payment_method` + table status → `cleanup`

**June data scripts**

`backend/src/scripts/resetJuneData.js`: batch-deletes orders/kitchen_queue/insights/reservations, resets T01–T08 to `status: open`, deletes `analytics/historical_baseline`

`backend/src/scripts/generateJuneData.js`: generates 1,560 orders (1,170 dine-in + 390 takeaway) + 210 reservations for June 1–30 2026. Sessions: lunch 11:00–14:00, dinner 18:00–22:00. Channels: `dine_in` + `takeaway` only. 70% occupancy, ±10% daily variance, realistic hour-weighted distribution. Menu: 5 items weighted by popularity. Payments: cash 40% / card 35% / momo 25%.

**Firestore quota hit** during `resetJuneData.js` run (RESOURCE_EXHAUSTED on first collection scan). Scripts are ready; must run after 14:00 Vietnam time when quota resets.

---

### 2026-06-25 (session 2 — ops fixes + recipe management)

**FOH operational fixes**

- **Recall to Kitchen button**: orders stuck in `in_kitchen` with no queue entries now show a `🔔 Recall to Kitchen` button. Duplicate-safe — warns if active queue entries already exist.
- **Add More Items**: after a served order, adding more items now sends only the *new* items to `kitchen_queue` (not all items). Full merged total still saved to the order for billing.
- **Delete Reservation**: added Delete button per reservation row with confirm dialog.
- **Reservation auto-complete**: when staff marks a table clean after payment, any linked confirmed reservation is automatically marked `completed` and its table assignment cleared.

**Recipe management (BOH → new Recipes tab)**

- Full CRUD for dishes and ingredients stored in new Firestore `menu_items` collection.
- Auto-seeds from hardcoded `MENU_ITEMS` on first load if collection is empty.
- Each dish card shows: selling price (inline editable), estimated cost, profit margin %.
- Ingredients: add/edit (qty per serving + cost/unit) / delete per row.
- Editing an ingredient's cost/unit writes to the `inventory` document's `unit_cost` field.
- New dishes created in BOH appear immediately in FOH order picker (live `onSnapshot`).

**Inventory — cost per unit**

- Added `unit_cost` column to BOH Inventory tab (editable, Save persists to Firestore).
- Auto-seeds realistic VND costs on first load if no items have `unit_cost`:
  chicken 90k, beef 220k, shrimp 180k, rice 22k, basil 40k, coconut milk 35k.

**Inventory deduction on order**

- `handleSendToKitchen`: deducts all recipe ingredients atomically in the same batch as kitchen queue creation.
- `handleAddMoreItems`: deducts only newly added items' ingredients.
- FOH order picker: dishes whose ingredient stock < 1 serving qty are shown grayed out with "Out of stock / Hết nguyên liệu" — +/− buttons disabled.

**Role simplification**

- `admin` and `manager` are now identical permission tiers.
- Staff can access: FOH, BOH, Guest Management, Insights, Settings.
- Dashboard and AI Consultant are manager/admin only (UI hidden + route guard redirects to `/foh`).
- Firestore rules updated: all operational collections allow write by any `isSignedIn()` user; `consultant_conversations` restricted to `isManagerOrAdmin()`.

**Firestore rules**

- Added `menu_items` collection rule (was missing — caused "loading forever" + "error saving" on Recipes tab).

---

### 2026-06-26 (session 4 — Dashboard redesign + UI polish + AI fixes)

**Dashboard full redesign** (`9a8d5c4` → `9a45391`)

- Layout changed from card-grid to **sidebar + main-panel**: left sidebar shows Floor Plan (color-coded table tiles with `seated_at` elapsed time) + Guest Tracking (today's covers, pending reservations, recent loyalty activity); main panel retains KPI cards + AI summary card + alerts feed.
- Floor plan tiles stretch to match alert panel height (flex layout).
- KPI cards: text center-aligned, values display to 2 decimal places in BOH profit panel.
- AI summary card recolored (chili red → softer accent matching design system).
- Shift Report tab removed from BOH (was redundant with Labor tab).
- "Kitchen Ops" nav item removed; renamed remaining nav items for clarity.
- Ready queue (kitchen kanban) now sorts oldest-first so urgent tickets surface at top.

**Consultant fixes** (`0c9b99e`, `2f35256`)

- Fixed crash when user asked a wait-time query — backend now enriches queue data with `seated_at` before passing to Cohere, preventing `undefined` dereference.
- Bottom bar background fixed to `#F2F2F7` to match AppShell; no longer renders as white stripe.

**UI polish passes** (`5091af5`, `8e193a6`)

- Navbar: avatar sizing, active link underline alignment.
- Kanban advance buttons: arrow suffix (`→`) for visual clarity.
- Table grid: color-coded status border more prominent.
- Tier pills (Gold/Silver/Bronze): use brand token variables consistently.
- BOH buttons: spacing and sizing normalized.

**Inventory deduction fix** (`5b5a43f`)

- `handleSendToKitchen` now reads **fresh stock from Supabase** immediately before deducting (previously used stale React state), eliminating race condition where concurrent orders could over-deduct.

**Unified sidebar layout** (`9944514`)

- All pages (FOH, BOH, Guest, Insights, Consultant) share the same AppShell sidebar-content structure. Consultant height fixed from `calc(100vh-52px)` to `flex:1` to align with new layout.

**Realistic revenue seed** (`9a45391`)

- `backend/src/scripts/seedRealisticRevenue.js` (or equivalent): populates today's orders with a busy-scenario revenue profile for demo purposes.
- Menu item prices updated to realistic VND values matching the busy scenario.

---

### 2026-06-25 (session 3 — full Supabase migration + deployment)

**Full migration: Firestore → Supabase (PostgreSQL)**

- Firestore database deleted (free-tier quota exhausted; 2000+ orders exceeded 50K reads/day limit).
- All data moved to Supabase project `zekubqxngmhlfqbfgdzo`.
- DDL in `backend/src/scripts/supabase_schema.sql` — tables: `tables`, `menu_items`, `inventory`, `staff_shifts`, `orders`, `kitchen_queue`, `insights`, `reservations`, `consultant_messages`, `analytics_baseline`, `users`.
- `backend/src/supabaseClient.js` created — uses `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- All backend controllers migrated: `ordersController`, `insightsController`, `consultantController`, `profitController`.
- `loadOrdersToSupabase.js` — one-time script loaded 2000 June orders from JSON into Supabase.
- `computeHistoricalBaseline.js` updated to read from Supabase `orders` table, write to `analytics_baseline`.
- `seedSupabase.js` — seeds tables, menu_items, inventory, staff_shifts, reservations, users, kitchen_queue, live orders.

**Frontend migration: Firestore → Supabase real-time**

- `frontend/src/services/firebase.js` — removed `getFirestore`/`db`; only `auth` (Firebase Auth) remains.
- `frontend/src/services/supabase.js` — created with anon key.
- All pages (Dashboard, FOH, BOH, Insights, GuestEngagement, Consultant) migrated from `onSnapshot` to Supabase `postgres_changes` real-time subscriptions.
- `AuthContext.jsx` — user role now fetched from `/api/me` (backend, Firebase-token-protected) instead of Supabase anon key, which was blocked by RLS.

**Supabase RLS fix**

- RLS `disable` commands were insufficient — anon key still returned 0 rows.
- Fix: enabled RLS on all tables + created `allow_all` policy for `anon` and `authenticated` roles:
  ```sql
  create policy "allow_all" on <table> for all to anon, authenticated using (true) with check (true);
  ```
- Also granted `usage` on schema public + `all` on all tables to `anon`/`authenticated`.

**Backend `/api/me` endpoint**

- Added `GET /api/me` (Firebase-auth-protected) — reads user row from Supabase with service key, returns `{ uid, email, role }`.
- `AuthContext` calls this on login to get role; Dashboard + AI Consultant nav items appear for `admin`/`manager`.

**Deployment**

- Backend deployed to Render: `https://pang-pang.onrender.com`.
- Frontend deployed to Vercel: `https://final-wine-five.vercel.app`.
- `VITE_API_BASE_URL` set in Vercel env vars pointing to Render.
- Render env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `COHERE_API_KEY`, `COHERE_MODEL=command-a-03-2025`, Firebase service account JSON.

**Data state (post-migration)**

- 2000 historical June orders in Supabase `orders` table.
- 4 live orders seeded (LIVE-001 to LIVE-004); LIVE-003 status `pending`.
- 8 tables (T01–T08): open/dining/reserved per realistic state.
- 7 confirmed + 1 cancelled reservations (R001–R008).
- 14 staff shifts across 2 shifts.
- 2 users: `hgiang2308@gmail.com` (admin), `staff.test@pangpang.local` (staff).
- Kitchen queue: KQ-001 `in_progress`.
