# Pang Pang SmartOps AI — Progress Tracker

**Status as of 2026-06-25:** All 11 build steps complete. App deployed to Vercel (`https://final-wine-five.vercel.app`). Backend API calls eliminated — all data flows directly through Firestore client SDK. Pang Pang brand redesign and full UI restructure complete. June 2026 demo data scripts written; **data load blocked on Firestore free-tier quota** (resets 14:00 Vietnam time / midnight Pacific Time daily).

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
- **Firestore security rules:** published live. Staff role cannot write insights/inventory/staff_shifts. `consultant_conversations/{uid}` is owner-only.

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

### 2026-06-25

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
