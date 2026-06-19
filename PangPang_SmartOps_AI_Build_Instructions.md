//# BUILD INSTRUCTION — Pang Pang SmartOps AI (Bilingual Web App)

> **Purpose of this document:** Give this entire file to Claude (ideally Claude Code) as the build brief for a working software prototype of "Pang Pang SmartOps AI." It translates the business proposal into a concrete technical spec: stack, data model, screens, APIs, and a step-by-step build order. Claude should follow it section by section and ask before deviating from the stack or data model.

---

## 1. PROJECT SUMMARY

Build **Pang Pang SmartOps AI**, a bilingual (English / Vietnamese) AI-powered restaurant operations dashboard for Pang Pang Restaurant (Thai casual dining). The app ingests operational data (orders, inventory, staff, reservations, feedback) and surfaces:

1. **What is happening** — real-time operational dashboard (FOH / BOH / Guest Engagement).
2. **Why it's happening** — root-cause analysis on revenue dips, complaint spikes, stockouts, kitchen bottlenecks.
3. **What to do next** — AI-generated recommendations, written as natural-language briefings.

This is a prototype/MVP, not the full enterprise platform — favor a working vertical slice over exhaustive coverage of every module in the proposal.

---

## 2. TECH STACK (do not substitute without asking)

| Layer | Technology |
|---|---|
| Frontend | React (Vite), JavaScript (not TypeScript unless asked) |
| Styling | Tailwind CSS |
| i18n | `react-i18next` + `i18next-browser-languagedetector` |
| State | React Context + hooks (no Redux unless app grows large) |
| Backend | Node.js + Express (REST API) |
| Database | Firebase **Firestore** (NoSQL) |
| Auth | Firebase **Authentication** (email/password, role-based: admin / manager / staff) |
| Hosting (optional) | Firebase Hosting (frontend) + Cloud Functions or Cloud Run (backend) |
| Realtime updates | Firestore `onSnapshot` listeners on the frontend, or Firebase Cloud Functions triggers feeding into REST endpoints |
| "AI" layer | Rule-based / statistical logic in the backend for the MVP (clearly marked as simulated AI — see §6). Do not call external LLM APIs unless the user explicitly asks for that integration. |

### Repo structure

```
pangpang-smartops/
├── frontend/                # React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── locales/
│   │   │   ├── en/translation.json
│   │   │   └── vi/translation.json
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/        # firebase.js, api.js
│   │   └── App.jsx
│   └── vite.config.js
├── backend/                  # Express API
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/         # rootCauseEngine.js, riskForecast.js, recommendation.js
│   │   ├── firebaseAdmin.js
│   │   └── server.js
│   └── package.json
└── README.md
```

---

## 3. BILINGUAL (EN / VI) REQUIREMENTS

- Every UI string lives in `frontend/src/locales/en/translation.json` and `vi/translation.json` — no hardcoded strings in components.
- Default language: Vietnamese (`vi`); allow toggle to English. Persist choice in `localStorage` via i18next's language detector.
- Number/currency formatting: VND with `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`; dates use `vi-VN` or `en-US` locale based on active language.
- AI-generated natural-language briefings (root cause notifications, recommendations — see §6) must be generated/stored with **both** an English and Vietnamese version (or templated so both can be rendered from structured data — preferred, since it avoids needing a translation call per insight).

---

## 4. DATA MODEL (Firestore collections)

Keep documents flat and query-friendly. Suggested collections:

### `orders`
```
{
  id, channel: "dine_in" | "delivery" | "reservation",
  items: [{ sku, name_en, name_vi, qty, unit_price }],
  table_id, status: "open" | "in_kitchen" | "served" | "cancelled",
  created_at, served_at, total_amount, payment_method
}
```

### `inventory`
```
{
  sku, name_en, name_vi, unit, current_stock,
  par_level, avg_daily_consumption, last_restocked_at
}
```

### `kitchen_queue`
```
{
  order_id, item_sku, station, status: "queued" | "cooking" | "ready",
  queued_at, started_at, completed_at, prep_time_target_min
}
```

### `staff_shifts`
```
{ staff_id, name, role, shift_start, shift_end, station, tasks_completed }
```

### `tables`
```
{ table_id, capacity, status: "open" | "reserved" | "dining" | "cleanup", seated_at }
```

### `reservations`
```
{ id, guest_name, party_size, reservation_time, status, contact }
```

### `feedback`
```
{ order_id, rating, comment, category: "food" | "service" | "wait_time", created_at }
```

### `external_factors`
```
{ date, weather: "rain" | "clear" | ..., is_holiday: bool, local_event: string|null }
```

### `insights` (output of the AI engine — see §6)
```
{
  id, type: "root_cause" | "risk_forecast" | "recommendation",
  created_at, severity: "info" | "warning" | "critical",
  summary_en, summary_vi,
  metrics: { revenue_impact_vnd, wait_time_delta_min, ... },
  related_entities: { sku, table_id, shift_id, ... },

  status: "new" | "acknowledged" | "acted_on"
}
```

### `users`
```
{ uid, name, role: "admin" | "manager" | "staff", preferred_language: "en" | "vi" }
```

---

## 5. CORE SCREENS (frontend)

Build these as routed pages (`react-router-dom`):

1. **Login** — Firebase Auth email/password.
2. **Dashboard (Home)** — today's revenue, covers, avg ticket, table occupancy heatmap, active alerts feed (from `insights`), each alert shown as a card with the natural-language briefing (§6 example format) and a "view details" / "mark acted on" action.
3. **Front of House**
   - Live table layout grid (open / reserved / dining / cleanup), click to view order.
   - POS-lite: create/view an order, add items, send to kitchen.
   - Payment screen: record payment method, split bill.
4. **Back of House**
   - Inventory table: stock vs. par level, consumption velocity, "will run out by HH:MM" projection for items trending low.
   - Kitchen Display: queue cards by station with elapsed time and overload warning banner if queue depth/avg prep time breaches threshold.
   - Labor: shift roster vs. live order volume, simple under/over-staffed flag.
   - Profit snapshot: revenue vs. food cost vs. labor cost for the day/week.
5. **Guest Engagement**
   - Reservations list/calendar.
   - Basic loyalty/CLV view: top repeat customers, visit frequency.
6. **Insights / Root Cause feed** — full list of `insights` documents, filterable by type/severity, each rendered as the natural-language card described in §6.
7. **Settings** — language toggle, user role display.

Use the `frontend-design` skill before building any of these screens for visual/styling guidance — don't default to generic Tailwind boilerplate.

--- 

## 6. "AI INTELLIGENCE ENGINE" — MVP IMPLEMENTATION NOTE

The proposal describes a full ML/AI engine (root cause analysis, predictive risk detection, recommendation engine). For this build:

- Implement these as **deterministic, rule-based backend services** in `backend/src/services/`, clearly documented as a simulated/rule-based stand-in for the full ML system described in the proposal. Do not claim or imply real machine-learning models are running unless the user later asks to integrate one.
- `rootCauseEngine.js`: when revenue for a time window is below a rolling baseline by more than X%, cross-reference `kitchen_queue` overload, `inventory` stockouts in that window, and `feedback` complaint spikes to produce a structured root-cause record, written to `insights`.
- `riskForecast.js`: compare current order velocity and inventory burn rate against historical hourly baselines (+ `external_factors`) to flag items at risk of stockout within N minutes, or kitchen overload risk.
- `recommendationEngine.js`: given an `insights` record, attach a templated recommendation (e.g., "increase stock buffer for {item} by {pct}%", "add {n} floor staff to {shift}").
- Each generated insight should populate both `summary_en` and `summary_vi` using template strings with interpolated values (mirrors the example in the proposal: *"Tonight's revenue dropped by 8%... Recommendation: increase ingredient stock buffers..."*).
- Run these as a scheduled job (e.g., every 5–15 simulated minutes, or triggered on new order/inventory writes via a backend endpoint or Cloud Function) rather than purely on-demand, so the dashboard feels "live."

---

## 7. BACKEND API (Express)

Expose REST endpoints that wrap Firestore reads/writes and the AI services (frontend should generally read Firestore directly via the SDK for live data, and call the backend for write-with-business-logic operations and AI-generated insights):

```
GET    /api/insights                # list, filterable by type/severity/status
POST   /api/insights/:id/acknowledge
POST   /api/orders                  # create order (validates stock, decrements inventory)
PATCH  /api/orders/:id/status
GET    /api/inventory/forecast      # consumption velocity + time-to-stockout
GET    /api/kitchen/queue
GET    /api/profit/summary?range=
POST   /api/run-analysis            # manually trigger root-cause/forecast pass (for demo/dev)
```

Use Firebase Admin SDK on the backend (`firebaseAdmin.js`) with a service account; verify Firebase ID tokens on protected routes via middleware.

---

## 8. FIREBASE SETUP STEPS (Claude should walk the user through these, since they require console access Claude can't perform itself)

1. Create a Firebase project in the console.
2. Enable **Firestore** (production mode) and **Authentication** (Email/Password provider).
3. Generate a Web App config object → goes into `frontend/src/services/firebase.js`.
4. Generate a service-account key (Project Settings → Service Accounts) → used by `backend/src/firebaseAdmin.js`, loaded via environment variable, **never committed**.
5. Add Firestore security rules: only authenticated users can read; only `manager`/`admin` roles can write to `insights`, `inventory`, `staff_shifts`; staff can write `orders`/`kitchen_queue` updates.
6. Add `.env` files (frontend: `VITE_FIREBASE_*` keys; backend: `FIREBASE_SERVICE_ACCOUNT`, `PORT`) and `.gitignore` them.

Claude should pause and ask the user for their actual Firebase config values rather than inventing placeholder credentials that look real.

---

## 9. BUILD ORDER (recommended sequence for Claude Code)

1. Scaffold `frontend/` (Vite + React + Tailwind + react-router-dom + i18next) and `backend/` (Express skeleton).
2. Wire up Firebase: `firebase.js` (frontend SDK init) and `firebaseAdmin.js` (backend admin init) — using placeholder env vars first, confirm with user before assuming real project exists.
3. Build Auth flow (login page, protected routes, role context).
4. Build i18n scaffolding with a handful of seed keys; confirm the toggle works end-to-end before filling in all strings.
5. Seed Firestore with mock data (orders, inventory, tables, staff_shifts) via a small seed script — needed to demo the dashboard before live POS input exists.
6. Build Dashboard page reading from Firestore (`onSnapshot`) for live numbers.
7. Build Front of House (tables + POS-lite).
8. Build Back of House (inventory + KDS + labor + profit).
9. Build backend AI services (§6) + `/api/insights` + insights feed UI.
10. Build Guest Engagement (reservations, basic loyalty view).
11. Polish: full i18n string coverage, empty/loading/error states, responsive layout.
12. (Optional) Deploy: Firebase Hosting for frontend, Cloud Functions/Cloud Run for backend.

Build and verify each numbered step before moving to the next; don't generate the entire codebase in one shot.

---

## 10. OUT OF SCOPE FOR MVP (mention if asked, don't build unless requested)

- Real machine-learning models / external LLM calls for the "AI Engine."
- Payment gateway integrations (simulate payment recording only).
- Delivery-platform API integrations (Grab/ShopeeFood etc.) — model delivery orders as a `channel` value only.
- Marketing automation send pipelines (email/SMS) — model campaigns as data only.
- Multi-restaurant/multi-tenant support.

---

## 11. ACCEPTANCE CHECKLIST

- [ ] App runs locally end-to-end (`npm run dev` frontend, `npm start` backend) against a real or emulated Firebase project.
- [ ] Language toggle switches every visible string, including AI-generated insight cards.
- [ ] Creating an order decrements inventory and appears in the Kitchen Display in real time.
- [ ] Forcing a stockout (manually zero an item's stock) produces a new `insights` document visible on the Dashboard within one analysis cycle.
- [ ] Firestore security rules tested: a `staff`-role user cannot write to `insights` or `inventory`.
- [ ] No hardcoded Firebase credentials committed to the repo.
