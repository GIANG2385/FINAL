# Pang Pang SmartOps — App Summary

**Stack:** React (Vite) + Express (Node) · Firebase Auth (login only) · Supabase (PostgreSQL, real-time) · Cohere AI · Deployed: Vercel (frontend) + Render (backend)

**Live URLs:**
- Frontend: https://final-wine-five.vercel.app
- Backend: https://pang-pang.onrender.com

---

## Auth & Roles

- Login via Firebase Email/Password (`/login`)
- After login, role fetched from `/api/me` (backend reads `users` table with service key)
- Two roles: `staff` and `manager`/`admin` (manager = admin, same permissions)
- **Staff** can access: FOH, BOH, Guest Management, Insights, Settings
- **Manager/Admin** can also access: Dashboard, AI Consultant
- Unauthorized route → redirect to `/foh`

**Test accounts:**
- `hgiang2308@gmail.com` — admin
- `staff.test@pangpang.local` — staff

---

## Brand Tokens (`frontend/src/index.css`)

```css
--pp-primary:        #E8002A   /* chili red — buttons, active nav, send */
--pp-primary-hover:  #C5001F
--pp-primary-light:  #FFEAED   /* red chip backgrounds */
--pp-primary-text:   #A8001F
--pp-primary-border: #F5A0AC

--pp-yellow:         #FFF8D6   /* page background, table headers */
--pp-yellow-strong:  #F5C800
--pp-yellow-border:  #E8D98A

--pp-navbar-bg:      #1A1A1A   /* dark navbar */
--pp-navbar-text:    #FFFFFF
--pp-navbar-muted:   rgba(255,255,255,0.55)

--pp-card-bg:        #FFFFFF
--pp-border:         #E8E0C8
--pp-page-bg:        #FFF8D6

--pp-text:           #1A1A1A
--pp-text-muted:     #6B6045
--pp-text-hint:      #A09070

/* Status colors */
--pp-success-bg/text/border:  green family
--pp-warning-bg/text/border:  yellow family
--pp-danger-bg/text/border:   red family
--pp-info-bg/text/border:     purple family
--pp-neutral-bg/text/border:  slate family

/* Loyalty tiers */
--pp-gold-bg/text/border:     amber
--pp-silver-bg/text/border:   slate
--pp-bronze-bg/text/border:   orange
```

---

## Navigation (`frontend/src/App.jsx`)

Dark sticky navbar (`--pp-navbar-bg: #1A1A1A`). Active link = bold + red underline.

| Nav item | Route | Roles |
|---|---|---|
| Dashboard | `/` | manager, admin |
| Front of House | `/foh` | all |
| Back of House | `/boh` | all |
| Guest Management | `/guests` | all |
| Insights | `/insights` | all |
| AI Consultant | `/consultant` | manager, admin |
| Settings | `/settings` | all |

VI/EN toggle pill in navbar (right side). User email + logout button.

---

## Pages

### Dashboard (`/`) — manager/admin only
**File:** `frontend/src/pages/Dashboard.jsx`

- KPI cards: Today's Revenue (VND), Covers, Avg Ticket, Occupancy %
- Revenue range toggle: Today / This Week / This Month
- Historical comparison: vs typical for this weekday (from `analytics_baseline`)
- Red AI Summary card: narrative from active insights
- Alerts feed: active insights deduplicated by summary+type, capped at 3
- Real-time via Supabase subscription on `orders` + `insights`

**Data sources:** `orders`, `insights`, `analytics_baseline`, `tables`

---

### Front of House (`/foh`)
**File:** `frontend/src/pages/FrontOfHouse.jsx` (1189 lines)

**3 tabs:**

#### Tab 1 — Tables
- 8-table grid (T01–T08), color-coded by status:
  - `open` → white/neutral
  - `reserved` → info/purple
  - `dining` → warning/yellow with elapsed time badge
  - `cleanup` → neutral gray
- Click a dining/open table → opens Order Panel (right side)
- **Order Panel:**
  - Menu picker: 5 items with +/− qty buttons (greyed out if ingredient stock < 1 serving)
  - Shows current order items with running total (VND)
  - **Send to Kitchen** → creates `orders` row + `kitchen_queue` rows + deducts inventory
  - **Add More Items** → sends only new items to kitchen, merges total
  - **Recall to Kitchen** → re-queues stuck orders (warns if already queued)
  - **Mark Served** → updates order `served_at`
  - **Record Payment** → cash/card/MoMo, marks table `cleanup`
  - **Table Clean** → resets table to `open`, auto-completes linked reservation

#### Tab 2 — Orders (Kitchen Kanban)
- 3 columns: Pending / In Kitchen / Completed
- Each card shows: table ID, item name (VI), qty, elapsed time since queued
- Status transitions: queued → in_progress → ready
- Click card to advance status

#### Tab 3 — Reservations
- AI peak forecast banner (18:30–20:00)
- Add reservation form: guest name, phone, party size, table, date/time, note
- Reservation list: all upcoming + today's, sorted by time
- Status badges: confirmed (green), pending (yellow), cancelled (red)
- **Delete** button per row (confirm dialog)

**Data sources:** `tables`, `orders`, `kitchen_queue`, `inventory`, `reservations`, `menu_items`

---

### Back of House (`/boh`)
**File:** `frontend/src/pages/BackOfHouse.jsx` (803 lines)

**3 tabs:**

#### Tab 1 — Inventory
- Table: ingredient name, current stock, par level, stockout projection, cost/unit, update controls
- Inline edit: qty ± buttons + manual input, cost/unit text field → **Save** writes to Supabase
- Stockout projection: `current_stock / (avg_daily_consumption / 24)` hours remaining
- At-risk items (≤6h) highlighted in red
- Real-time via Supabase subscription on `inventory`

#### Tab 2 — Labor
- Staff table: name, role, shift times, on-shift badge
- Staffing flag if < 2 on shift
- AI forecast banner

#### Tab 3 — Recipes
- Dish cards: selling price (inline editable), estimated cost, profit margin %
- Per dish: ingredient list with qty per serving
- Add/edit ingredient: qty + cost/unit → writing cost/unit also updates `inventory.cost_per_unit`
- Auto-seeds from `MENU_ITEMS` in `frontend/src/data/menu.js` on first load

**Data sources:** `inventory`, `staff_shifts`, `menu_items`, `orders` (profit calc)

---

### Guest Management (`/guests`)
**File:** `frontend/src/pages/GuestEngagement.jsx`

- Loyalty table: guest name, visit count, loyalty points (visits × 50), tier, last visit
- Tiers: **Gold** ≥10 visits, **Silver** ≥5, **Bronze** <5
- Shows ALL non-cancelled guests (no minimum threshold)
- At-risk insight banner
- Real-time via Supabase subscription on `reservations`

**Data source:** `reservations` (loyalty derived from reservation history)

Current data: 6 original + 29 historical = 35 reservations. Key guests:
- Nguyen Van A — 12 visits → Gold
- Tran Thi B — 7 visits → Silver
- Le Van C — 6 visits → Silver

---

### Insights (`/insights`)
**File:** `frontend/src/pages/Insights.jsx`

- Filter by type (`risk_forecast`, `root_cause`) and severity (`warning`, `critical`)
- Insight cards: severity badge, summary text, timestamp, Acknowledge button
- On page load → calls `POST /api/insights/run` to trigger fresh analysis
- Real-time subscription on `insights` table
- Acknowledge → updates insight `status` to `acted_on`

**Alert types generated:**
- `risk_forecast` — ingredient ≤6h remaining (critical if ≤2h)
- `root_cause` — revenue ≥15% below historical baseline for this hour
- Kitchen overload if queue depth ≥5

**Data source:** `insights`

---

### AI Consultant (`/consultant`) — manager/admin only
**File:** `frontend/src/pages/Consultant.jsx`

- Chat UI: red user bubbles, white AI bubbles with 🤖 avatar
- Quick-prompt chips (pre-set questions)
- Typing dots animation while AI generates
- Optimistic updates: message appears instantly, real-time INSERT subscription deduplicates
- Clear chat, copy message, regenerate last response
- Real-time: Supabase subscription on `consultant_messages`

**AI context injected (live from Supabase):**
- Revenue today vs historical baseline
- Table occupancy breakdown
- Kitchen queue: pending/in-kitchen/delayed + per-item wait times with table ID
- Longest wait: table ID, item, minutes waiting
- Avg dining time (order created → served), avg cook time vs 15-min target
- Inventory at-risk items with hours remaining
- Staff on shift now
- Today's reservations + next arrival time
- Loyalty summary (repeat members, at-risk count)
- Top items sold today
- Active AI insights

**Data source:** `consultant_messages`, all operational tables (via backend snapshot)
**AI model:** Cohere `command-a-03-2025`

---

### Settings (`/settings`)
- Language card: VI/EN toggle (also available in navbar)
- Tip note about navbar toggle

---

## Database (Supabase)

**Project:** `zekubqxngmhlfqbfgdzo`

| Table | Key columns |
|---|---|
| `users` | `uid`, `email`, `role` |
| `tables` | `table_id`, `capacity`, `status` (open/reserved/dining/cleanup), `seated_at` |
| `menu_items` | `sku`, `name_en`, `name_vi`, `unit_price`, `category`, `recipes` (jsonb) |
| `inventory` | `sku`, `name_en`, `name_vi`, `unit`, `current_stock`, `par_level`, `avg_daily_consumption`, `cost_per_unit` |
| `orders` | `id`, `channel`, `table_id`, `items` (jsonb), `status`, `created_at`, `served_at`, `total_amount`, `payment_method` |
| `kitchen_queue` | `queue_id`, `order_id`, `table_id`, `item_sku`, `item_name`, `item_name_en`, `item_name_vi`, `qty`, `station`, `status` (queued/in_progress/ready), `queued_at`, `started_at`, `completed_at`, `prep_time_target_min` |
| `reservations` | `reservation_id`, `guest_name`, `party_size`, `table_id`, `reservation_time`, `status`, `phone`, `note` |
| `insights` | `id`, `type`, `severity`, `summary_en`, `summary_vi`, `related_entities` (jsonb), `metrics` (jsonb), `status`, `created_at` |
| `consultant_messages` | `id`, `user_id`, `role`, `content`, `created_at` |
| `staff_shifts` | `staff_id`, `name`, `role`, `shift`, `shift_start`, `shift_end`, `station`, `tasks_completed` |
| `analytics_baseline` | `id`, `distinct_days`, `avg_daily_revenue`, `by_weekday` (jsonb), `by_hour` (jsonb), `computed_at` |

**Real-time:** all tables in `supabase_realtime` publication. `consultant_messages` has `REPLICA IDENTITY FULL`.

**RLS:** enabled on all tables with `allow_all` policy for `anon` + `authenticated`.

---

## Menu Items (`frontend/src/data/menu.js`)

| SKU | Name (EN) | Name (VI) | Price | Ingredients |
|---|---|---|---|---|
| `MENU-BEEFBASIL` | Basil Beef | Bò xào húng quế | 110,000 | INV-BEEF-01 (0.2kg), INV-BASIL-01 (0.05kg) |
| `MENU-CHICKENCURRY` | Chicken Curry | Cà ri gà | 105,000 | INV-CHK-01 (0.25kg), INV-COCO-01 (0.15L) |
| `MENU-TOMYUM` | Tom Yum Soup | Súp Tom Yum | 95,000 | INV-SHRIMP-01 (0.15kg), INV-BASIL-01 (0.03kg) |
| `MENU-PADTHAI` | Pad Thai | Pad Thái | 90,000 | INV-SHRIMP-01 (0.12kg), INV-NOODLE-01 (0.1kg) |
| `MENU-MANGORICE` | Mango Sticky Rice | Xôi xoài | 65,000 | INV-RICE-01 (0.15kg), INV-MANGO-01 (0.2kg) |

---

## Backend Routes (`backend/src/server.js`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/me` | Firebase token | Returns `{ uid, email, role }` |
| GET | `/api/insights` | Firebase token | List insights (filter by type/severity/status) |
| POST | `/api/insights/run` | Firebase token | Trigger analysis engine immediately |
| POST | `/api/insights/:id/acknowledge` | Firebase token | Mark insight `acted_on` |
| POST | `/api/consultant/messages` | Firebase token | Send message, get AI reply |
| DELETE | `/api/consultant/messages` | Firebase token | Clear chat history |
| GET | `/api/orders` | Firebase token | List orders |
| GET | `/api/profit` | Firebase token | Profit summary |

Backend scheduler runs `runAnalysisInternal()` every 30s.

---

## Known Current State

- **Inventory at risk:** Chicken Thigh (~3h), Shrimp (~4h), Thai Basil (~6h)
- **Orders:** 2000+ historical June 2026 orders in `orders` table
- **Tables:** T01–T08 mix of open/dining/reserved
- **Insights:** populates on page load via `/api/insights/run`
- **AI Consultant:** replies in real-time without page refresh

---

## UI Issues to Fix (your notes here)

<!-- Add your UI fix notes below -->
