# Firestore → Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all Firestore collections to Supabase tables while keeping Firebase Auth untouched.

**Architecture:** All runtime data reads/writes use `supabase.from(table)` client instead of `db.collection()`. Firebase Auth (`requireAuth.js`, `firebaseAdmin.js`) is preserved for JWT verification. The `db` import is removed from every file that no longer touches Firestore.

**Tech Stack:** Node.js/Express, `@supabase/supabase-js`, Firebase Admin SDK (auth only), `crypto.randomUUID()` for client-side UUIDs.

## Global Constraints

- Firebase Auth stays — never modify `src/middleware/requireAuth.js` or `src/firebaseAdmin.js`
- All Supabase reads/writes use `supabase.from(table).select/insert/update/upsert/delete` pattern
- On `{ error }` from Supabase, throw or return HTTP 500
- `orders` table already exists in Supabase — use `create table if not exists`
- SKUs in Supabase orders: `MENU-BEEFBASIL`, `MENU-CHICKENCURRY`, `MENU-TOMYUM`, `MENU-PADTHAI`, `MENU-MANGORICE`
- Table IDs in Supabase orders: `T01`–`T12`
- Do NOT import `db` from `firebaseAdmin.js` in any migrated file
- `seedSupabase.js` must NOT insert into `orders` table

---

### Task 1: SQL Schema

**Files:**
- Create: `src/scripts/supabase_schema.sql`

**Interfaces:**
- Produces: all table definitions consumed by `seedSupabase.js` (Task 9) and all controllers

- [ ] **Step 1: Write the SQL file**

```sql
-- src/scripts/supabase_schema.sql
-- Run once in Supabase SQL editor to create all tables.

-- tables
create table if not exists tables (
  table_id  text primary key,
  capacity  int  not null,
  status    text not null default 'open',  -- open | dining | reserved | cleanup
  seated_at timestamptz
);

-- menu_items
create table if not exists menu_items (
  sku         text primary key,
  name_en     text not null,
  name_vi     text not null,
  unit_price  int  not null,
  category    text
);

-- inventory
create table if not exists inventory (
  sku                   text primary key,
  name_en               text not null,
  name_vi               text not null,
  unit                  text not null,
  current_stock         numeric not null default 0,
  par_level             numeric not null default 0,
  avg_daily_consumption numeric not null default 0,
  cost_per_unit         numeric not null default 0,
  last_restocked_at     timestamptz
);

-- staff_shifts
create table if not exists staff_shifts (
  staff_id         text primary key,
  name             text not null,
  role             text not null,
  shift            text,
  shift_start      timestamptz not null,
  shift_end        timestamptz not null,
  station          text,
  tasks_completed  int not null default 0
);

-- orders (already exists — safe to re-run with IF NOT EXISTS)
create table if not exists orders (
  id             text primary key,
  table_id       text,
  channel        text not null default 'dine_in',
  status         text not null default 'open',
  items          jsonb not null default '[]',
  total_amount   numeric not null default 0,
  payment_method text,
  created_at     timestamptz not null default now(),
  served_at      timestamptz
);
create index if not exists orders_status_idx      on orders (status);
create index if not exists orders_served_at_idx   on orders (served_at);
create index if not exists orders_created_at_idx  on orders (created_at);

-- kitchen_queue
create table if not exists kitchen_queue (
  queue_id             text primary key default gen_random_uuid(),
  order_id             text not null,
  table_id             text,
  item_sku             text,
  item_name            text,
  qty                  int  not null default 1,
  station              text not null default 'kitchen',
  status               text not null default 'queued',
  queued_at            timestamptz not null default now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  prep_time_target_min int  not null default 15
);
create index if not exists kitchen_queue_status_idx on kitchen_queue (status);

-- insights
create table if not exists insights (
  id               text primary key default gen_random_uuid(),
  type             text not null,
  severity         text not null,
  summary_en       text not null,
  summary_vi       text not null,
  related_entities jsonb not null default '{}',
  status           text not null default 'new',
  created_at       timestamptz not null default now()
);
create index if not exists insights_type_idx   on insights (type);
create index if not exists insights_status_idx on insights (status);

-- reservations
create table if not exists reservations (
  reservation_id   text primary key,
  guest_name       text not null,
  party_size       int  not null,
  table_id         text,
  reservation_time timestamptz not null,
  status           text not null default 'confirmed',
  phone            text
);
create index if not exists reservations_time_idx on reservations (reservation_time);

-- consultant_messages (flattened from Firestore subcollection)
create table if not exists consultant_messages (
  id         text primary key default gen_random_uuid(),
  user_id    text not null,
  role       text not null,  -- user | assistant
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists consultant_messages_user_idx on consultant_messages (user_id, created_at);

-- analytics_baseline (single-row table)
create table if not exists analytics_baseline (
  id               text primary key,  -- always 'historical_baseline'
  distinct_days    int     not null default 0,
  avg_daily_revenue numeric not null default 0,
  by_weekday       jsonb   not null default '{}',
  by_hour          jsonb   not null default '{}',
  computed_at      timestamptz not null default now()
);

-- users
create table if not exists users (
  uid    text primary key,
  email  text,
  role   text not null default 'staff'
);
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/scripts/supabase_schema.sql
```

Expected: file shown with non-zero size.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/scripts/supabase_schema.sql
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: add supabase_schema.sql for all migrated collections"
```

---

### Task 2: Update menu.js SKUs

**Files:**
- Modify: `src/data/menu.js`

**Interfaces:**
- Produces: `findMenuItem(sku)` — same API, new SKUs/prices
- `ingredient_sku` values used by `ordersController.js` to decrement `inventory.current_stock`

- [ ] **Step 1: Rewrite menu.js**

Replace the entire file content:

```js
// src/data/menu.js
// SKUs match the Supabase historical orders (MENU-* prefix).
// ingredient_sku references the inventory.sku column for stock decrements.
export const MENU_ITEMS = [
  {
    sku: 'MENU-BEEFBASIL',
    name_en: 'Basil Beef',
    name_vi: 'Bò xào húng quế',
    unit_price: 110000,
    ingredient_sku: 'INV-BEEF-01',
    ingredient_qty: 0.15,
  },
  {
    sku: 'MENU-CHICKENCURRY',
    name_en: 'Green Curry Chicken',
    name_vi: 'Cà ri xanh gà',
    unit_price: 105000,
    ingredient_sku: 'INV-CHK-01',
    ingredient_qty: 0.2,
  },
  {
    sku: 'MENU-TOMYUM',
    name_en: 'Tom Yum Soup',
    name_vi: 'Canh Tom Yum',
    unit_price: 120000,
    ingredient_sku: 'INV-SHRIMP-01',
    ingredient_qty: 0.1,
  },
  {
    sku: 'MENU-PADTHAI',
    name_en: 'Pad Thai Shrimp',
    name_vi: 'Pad Thai tôm',
    unit_price: 95000,
    ingredient_sku: 'INV-SHRIMP-01',
    ingredient_qty: 0.15,
  },
  {
    sku: 'MENU-MANGORICE',
    name_en: 'Mango Sticky Rice',
    name_vi: 'Xôi xoài',
    unit_price: 65000,
    ingredient_sku: 'INV-RICE-01',
    ingredient_qty: 0.15,
  },
]

export function findMenuItem(sku) {
  return MENU_ITEMS.find((m) => m.sku === sku)
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/data/menu.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: update menu.js SKUs to match Supabase order data"
```

---

### Task 3: Rewrite ordersController.js

**Files:**
- Modify: `src/controllers/ordersController.js`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient.js`, `findMenuItem` from `../data/menu.js`
- Produces: `POST /api/orders` → inserts into `orders`, decrements `inventory`, updates `tables`
- Produces: `PATCH /api/orders/:id/status` → updates `orders`, inserts into `kitchen_queue` on `in_kitchen`

- [ ] **Step 1: Rewrite the file**

```js
// src/controllers/ordersController.js
import { supabase } from '../supabaseClient.js'
import { findMenuItem } from '../data/menu.js'

export async function createOrder(req, res) {
  const { table_id, channel, items } = req.body

  if (!table_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'table_id and a non-empty items array are required' })
  }

  const resolvedItems = []
  for (const { sku, qty } of items) {
    const menuItem = findMenuItem(sku)
    if (!menuItem || !qty || qty < 1) {
      return res.status(400).json({ error: `Invalid item: ${sku}` })
    }
    resolvedItems.push({ ...menuItem, qty })
  }

  const total_amount = resolvedItems.reduce((sum, it) => sum + it.unit_price * it.qty, 0)

  // Decrement inventory (sequential, no transaction)
  for (const item of resolvedItems) {
    const { data: inv, error: invErr } = await supabase
      .from('inventory')
      .select('current_stock')
      .eq('sku', item.ingredient_sku)
      .single()
    if (invErr && invErr.code !== 'PGRST116') {
      return res.status(500).json({ error: invErr.message })
    }
    if (inv) {
      const next = Math.max(0, inv.current_stock - item.ingredient_qty * item.qty)
      const { error: updErr } = await supabase
        .from('inventory')
        .update({ current_stock: next })
        .eq('sku', item.ingredient_sku)
      if (updErr) return res.status(500).json({ error: updErr.message })
    }
  }

  // Insert order
  const orderId = crypto.randomUUID()
  const orderRow = {
    id: orderId,
    channel: channel || 'dine_in',
    items: resolvedItems.map(({ sku, name_en, name_vi, qty, unit_price }) => ({
      sku, name_en, name_vi, qty, unit_price,
    })),
    table_id,
    status: 'open',
    created_at: new Date().toISOString(),
    served_at: null,
    total_amount,
    payment_method: null,
  }
  const { data: created, error: orderErr } = await supabase
    .from('orders')
    .insert(orderRow)
    .select()
    .single()
  if (orderErr) return res.status(500).json({ error: orderErr.message })

  // Update table status
  const { error: tableErr } = await supabase
    .from('tables')
    .update({ status: 'dining', seated_at: new Date().toISOString() })
    .eq('table_id', table_id)
  if (tableErr) console.error('table update failed:', tableErr.message)

  res.status(201).json(created)
}

export async function updateOrderStatus(req, res) {
  const { id } = req.params
  const { status } = req.body
  const validStatuses = ['open', 'in_kitchen', 'served', 'cancelled']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` })
  }

  // Fetch existing order
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr) return res.status(404).json({ error: 'Order not found' })

  const update = { status }
  if (status === 'served') update.served_at = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return res.status(500).json({ error: updateErr.message })

  // Insert kitchen queue rows when status transitions to in_kitchen
  if (status === 'in_kitchen') {
    const queueRows = (order.items || []).map((item) => ({
      queue_id: crypto.randomUUID(),
      order_id: id,
      item_sku: item.sku,
      station: 'kitchen',
      status: 'queued',
      queued_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      prep_time_target_min: 15,
    }))
    if (queueRows.length > 0) {
      const { error: qErr } = await supabase.from('kitchen_queue').insert(queueRows)
      if (qErr) console.error('kitchen_queue insert failed:', qErr.message)
    }
  }

  res.json(updated)
}
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/controllers/ordersController.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/controllers/ordersController.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: rewrite ordersController to use Supabase"
```

---

### Task 4: Rewrite historicalBaseline.js

**Files:**
- Modify: `src/services/historicalBaseline.js`

**Interfaces:**
- Produces: `getHistoricalBaseline()` → `{ distinctDays, avgDailyRevenue, byWeekday, byHour }`
- Produces: `typicalRevenueForWindow(baseline, startHour, windowHours)` → number (unchanged)

- [ ] **Step 1: Rewrite the file**

```js
// src/services/historicalBaseline.js
// Reads from Supabase analytics_baseline table (single row id='historical_baseline').
import { supabase } from '../supabaseClient.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null
let cachedAt = 0

const EMPTY_BASELINE = { distinctDays: 0, avgDailyRevenue: 0, byWeekday: {}, byHour: {} }

export async function getHistoricalBaseline() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache

  const { data, error } = await supabase
    .from('analytics_baseline')
    .select('*')
    .eq('id', 'historical_baseline')
    .single()

  if (error || !data) {
    cache = EMPTY_BASELINE
  } else {
    cache = {
      distinctDays: data.distinct_days,
      avgDailyRevenue: data.avg_daily_revenue,
      byWeekday: data.by_weekday || {},
      byHour: data.by_hour || {},
    }
  }
  cachedAt = Date.now()
  return cache
}

export function typicalRevenueForWindow(baseline, startHour, windowHours) {
  let total = 0
  for (let i = 0; i < windowHours; i++) {
    const hour = (startHour + i + 24) % 24
    total += baseline.byHour[hour] || 0
  }
  return total
}
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/services/historicalBaseline.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/services/historicalBaseline.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: rewrite historicalBaseline service to read from Supabase"
```

---

### Task 5: Rewrite computeHistoricalBaseline.js

**Files:**
- Modify: `src/scripts/computeHistoricalBaseline.js`

**Interfaces:**
- Consumes: `supabase` (already reads orders from Supabase — only the final write changes)
- Produces: upserts row `{ id: 'historical_baseline', ... }` into `analytics_baseline`

- [ ] **Step 1: Rewrite only the final write (last 4 lines of the file)**

Replace the final `await db.collection(...)` call with a Supabase upsert. The full file:

```js
// src/scripts/computeHistoricalBaseline.js
// One-off precompute: scans pre-today served orders and stores a baseline in
// Supabase analytics_baseline. Re-run if more historical data is added.
import 'dotenv/config'
import { supabase } from '../supabaseClient.js'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const cutoff = startOfToday()
const { data: allOrders, error } = await supabase
  .from('orders')
  .select('served_at, total_amount, status')
  .eq('status', 'served')
  .lt('served_at', cutoff.toISOString())
if (error) { console.error(error.message); process.exit(1) }

const dayRevenue = new Map()
const dayCountByWeekday = new Map()
const weekdayRevenue = new Map()
const hourRevenue = new Map()
const hourDayCount = new Map()

for (const order of allOrders) {
  if (order.status !== 'served') continue
  const servedAt = new Date(order.served_at)

  const dateKey = servedAt.toDateString()
  const weekday = servedAt.getDay()
  const hour = servedAt.getHours()
  const amount = order.total_amount || 0

  dayRevenue.set(dateKey, (dayRevenue.get(dateKey) || 0) + amount)
  weekdayRevenue.set(weekday, (weekdayRevenue.get(weekday) || 0) + amount)
  hourRevenue.set(hour, (hourRevenue.get(hour) || 0) + amount)

  if (!dayCountByWeekday.has(weekday)) dayCountByWeekday.set(weekday, new Set())
  dayCountByWeekday.get(weekday).add(dateKey)

  if (!hourDayCount.has(hour)) hourDayCount.set(hour, new Set())
  hourDayCount.get(hour).add(dateKey)
}

const distinctDays = dayRevenue.size
const avgDailyRevenue = distinctDays > 0
  ? Math.round([...dayRevenue.values()].reduce((s, v) => s + v, 0) / distinctDays)
  : 0

const byWeekday = {}
for (let w = 0; w < 7; w++) {
  const days = dayCountByWeekday.get(w)?.size || 0
  byWeekday[w] = days > 0 ? Math.round((weekdayRevenue.get(w) || 0) / days) : 0
}

const byHour = {}
for (let h = 0; h < 24; h++) {
  const days = hourDayCount.get(h)?.size || 0
  byHour[h] = days > 0 ? Math.round((hourRevenue.get(h) || 0) / days) : 0
}

const { error: upsertErr } = await supabase
  .from('analytics_baseline')
  .upsert({
    id: 'historical_baseline',
    distinct_days: distinctDays,
    avg_daily_revenue: avgDailyRevenue,
    by_weekday: byWeekday,
    by_hour: byHour,
    computed_at: new Date().toISOString(),
  })
if (upsertErr) { console.error(upsertErr.message); process.exit(1) }

console.log(`Computed baseline from ${allOrders.length} historical orders across ${distinctDays} days.`)
console.log('avgDailyRevenue:', avgDailyRevenue)
process.exit(0)
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/scripts/computeHistoricalBaseline.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/scripts/computeHistoricalBaseline.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: write baseline to Supabase analytics_baseline table"
```

---

### Task 6: Update profitController.js — staff_shifts from Supabase

**Files:**
- Modify: `src/controllers/profitController.js`

**Interfaces:**
- Consumes: `supabase` (already imported), removes `db` import
- Produces: `GET /api/profit` — unchanged shape, labor_cost now computed from Supabase rows

- [ ] **Step 1: Rewrite the file**

```js
// src/controllers/profitController.js
import { supabase } from '../supabaseClient.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

const ASSUMED_FOOD_COST_PCT = 0.32
const HOURLY_WAGE_BY_ROLE = {
  chef:              72000,
  kitchen_assistant: 38500,
  server:            33700,
  cleaner:           30000,
  manager:           96200,
}
const DEFAULT_HOURLY_WAGE = 35000

const RANGE_DAYS = { day: 1, week: 7, month: 30 }

function startOfRange(range) {
  const days = RANGE_DAYS[range] ?? 1
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return cutoff
}

export async function getProfitSummary(req, res) {
  const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day'
  const cutoff = startOfRange(range)

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('total_amount, status')
    .eq('status', 'served')
    .gte('served_at', cutoff.toISOString())
  if (ordersErr) return res.status(500).json({ error: ordersErr.message })

  const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  const baseline = await getHistoricalBaseline()
  const historical_avg_revenue = baseline.avgDailyRevenue * RANGE_DAYS[range]

  const { data: shifts, error: shiftsErr } = await supabase
    .from('staff_shifts')
    .select('shift_start, shift_end, role')
  if (shiftsErr) return res.status(500).json({ error: shiftsErr.message })

  const labor_cost = (shifts || []).reduce((sum, shift) => {
    const start = new Date(shift.shift_start)
    const end = new Date(shift.shift_end)
    const hours = Math.max(0, (end - start) / (1000 * 60 * 60))
    const wage = HOURLY_WAGE_BY_ROLE[shift.role] ?? DEFAULT_HOURLY_WAGE
    return sum + hours * wage
  }, 0)

  const food_cost = Math.round(revenue * ASSUMED_FOOD_COST_PCT)
  const profit = revenue - food_cost - labor_cost

  res.json({
    range,
    revenue,
    food_cost,
    labor_cost: Math.round(labor_cost),
    profit: Math.round(profit),
    historical_avg_revenue,
  })
}
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/controllers/profitController.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/controllers/profitController.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: migrate profitController staff_shifts read to Supabase"
```

---

### Task 7: Update insightsController.js — inventory, kitchen_queue, insights from Supabase

**Files:**
- Modify: `src/controllers/insightsController.js`

**Interfaces:**
- Consumes: `supabase`, removes `db` import
- Produces: `runAnalysisInternal()` — same logic, all reads/writes via Supabase
- Produces: `listInsights(req, res)` — reads from `insights` table with optional filters
- Produces: `acknowledgeInsight(req, res)` — updates `insights.status`, reads user role from Supabase `users`

- [ ] **Step 1: Rewrite the file**

```js
// src/controllers/insightsController.js
import { supabase } from '../supabaseClient.js'
import { forecastStockout, forecastKitchenOverload } from '../services/riskForecast.js'
import { analyzeRootCause } from '../services/rootCauseEngine.js'
import { recommendationFor } from '../services/recommendationEngine.js'
import { getHistoricalBaseline, typicalRevenueForWindow } from '../services/historicalBaseline.js'

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

async function hasRecentOpenInsight(type, matchKey, matchValue) {
  const { data, error } = await supabase
    .from('insights')
    .select('status, created_at, related_entities')
    .eq('type', type)
  if (error) throw new Error(error.message)
  const cutoff = Date.now() - 30 * 60 * 1000
  return (data || []).some((row) => {
    if (row.status === 'acted_on') return false
    const createdAt = toDate(row.created_at)
    if (!createdAt || createdAt.getTime() < cutoff) return false
    return row.related_entities?.[matchKey] === matchValue
  })
}

function appendRecommendation(draft) {
  const rec = recommendationFor(draft)
  return {
    ...draft,
    summary_en: rec.en ? `${draft.summary_en} ${rec.en}` : draft.summary_en,
    summary_vi: rec.vi ? `${draft.summary_vi} ${rec.vi}` : draft.summary_vi,
  }
}

export async function runAnalysisInternal() {
  const created = []

  // --- Risk forecast: stockouts ---
  const { data: inventoryRows, error: invErr } = await supabase
    .from('inventory')
    .select('*')
  if (invErr) throw new Error(invErr.message)

  for (const item of inventoryRows || []) {
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hours_remaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    const draft = forecastStockout({ ...item, hours_remaining })
    if (!draft) continue
    if (await hasRecentOpenInsight('risk_forecast', 'sku', item.sku)) continue
    created.push(appendRecommendation(draft))
  }

  // --- Risk forecast: kitchen overload ---
  const { data: queueRows, error: qErr } = await supabase
    .from('kitchen_queue')
    .select('*')
    .neq('status', 'ready')
  if (qErr) throw new Error(qErr.message)

  const activeQueue = queueRows || []
  if (activeQueue.length > 0) {
    const now = Date.now()
    const elapsedList = activeQueue.map((q) => {
      const queuedAt = toDate(q.queued_at)
      return queuedAt ? (now - queuedAt.getTime()) / 60000 : 0
    })
    const avgElapsedMin = Math.round(elapsedList.reduce((s, v) => s + v, 0) / elapsedList.length)
    const targetMin = Math.round(
      activeQueue.reduce((s, q) => s + (q.prep_time_target_min || 15), 0) / activeQueue.length
    )
    const draft = forecastKitchenOverload({ queueDepth: activeQueue.length, avgElapsedMin, targetMin })
    if (draft) {
      draft.related_entities.overload = true
      if (!(await hasRecentOpenInsight('risk_forecast', 'overload', true))) {
        created.push(appendRecommendation(draft))
      }
    }
  }

  // --- Root cause: revenue in the last 2h vs the historical baseline ---
  const now = Date.now()
  const recentCutoff = new Date(now - 120 * 60000)
  const { data: recentOrders, error: recentErr } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('status', 'served')
    .gte('served_at', recentCutoff.toISOString())
  if (recentErr) throw new Error(recentErr.message)
  const recentRevenue = (recentOrders || []).reduce((s, o) => s + (o.total_amount || 0), 0)

  const baseline = await getHistoricalBaseline()
  const baselineRevenue = typicalRevenueForWindow(baseline, new Date(now).getHours() - 1, 2)

  const stockoutSkus = (inventoryRows || [])
    .filter((item) => item.current_stock <= 0)
    .map((item) => item.sku)

  const rootCauseDraft = analyzeRootCause({
    recentRevenue,
    baselineRevenue,
    stockoutSkus,
    kitchenOverloaded: activeQueue.length >= 5,
    complaintCount: 0,
  })
  if (
    rootCauseDraft &&
    !(await hasRecentOpenInsight(
      'root_cause',
      'kitchen_overloaded',
      rootCauseDraft.related_entities.kitchen_overloaded,
    ))
  ) {
    created.push(appendRecommendation(rootCauseDraft))
  }

  if (created.length > 0) {
    const rows = created.map((insight) => ({
      id: crypto.randomUUID(),
      ...insight,
      created_at: new Date().toISOString(),
      status: 'new',
    }))
    const { error: insertErr } = await supabase.from('insights').insert(rows)
    if (insertErr) throw new Error(insertErr.message)
  }

  return created.length
}

export async function runAnalysis(req, res) {
  const count = await runAnalysisInternal()
  res.json({ created: count })
}

export async function listInsights(req, res) {
  const { type, severity, status } = req.query
  let query = supabase.from('insights').select('*')
  if (type) query = query.eq('type', type)
  if (severity) query = query.eq('severity', severity)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
}

export async function acknowledgeInsight(req, res) {
  const { id } = req.params

  // Check user role from Supabase users table
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('uid', req.user.uid)
    .single()
  const role = userRow?.role ?? null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can acknowledge insights' })
  }

  const { data: existing } = await supabase
    .from('insights')
    .select('id')
    .eq('id', id)
    .single()
  if (!existing) return res.status(404).json({ error: 'Insight not found' })

  const { data: updated, error: updateErr } = await supabase
    .from('insights')
    .update({ status: 'acknowledged' })
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return res.status(500).json({ error: updateErr.message })

  res.json(updated)
}
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/controllers/insightsController.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/controllers/insightsController.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: migrate insightsController fully to Supabase"
```

---

### Task 8: Update consultantController.js — all Firestore reads/writes to Supabase

**Files:**
- Modify: `src/controllers/consultantController.js`

**Interfaces:**
- Consumes: `supabase`, removes `db` import
- `consultant_messages` table replaces Firestore subcollection; rows have `user_id` column
- `clearMessages` deletes from `consultant_messages` where `user_id = req.user.uid`
- `sendMessage` reads/writes `consultant_messages`, checks user role from Supabase `users`

- [ ] **Step 1: Rewrite the file**

```js
// src/controllers/consultantController.js
import { supabase } from '../supabaseClient.js'
import { getChatCompletion } from '../services/cohereClient.js'
import { getHistoricalBaseline } from '../services/historicalBaseline.js'

const HISTORY_LIMIT = 10

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

const STATIC_SUPPLIERS = [
  { name: 'Chị Lan — Chợ Hôm', reliability: 95, nextShortfall: 'Thịt bò (~1.5 ngày)' },
  { name: 'Anh Tuấn — Chợ Đồng Xuân', reliability: 82, nextShortfall: null },
  { name: 'Cty Minh Tâm', reliability: 68, nextShortfall: 'Bánh phở (~3 ngày)' },
]

const STATIC_CHANNELS = [
  { name: 'Dine-in', orders: 48, revenue: 6240000 },
  { name: 'Takeaway', orders: 15, revenue: 1350000 },
  { name: 'GrabFood', orders: 22, revenue: 2090000 },
  { name: 'ShopeeFood', orders: 9, revenue: 855000 },
]

async function buildDataSnapshot() {
  const today = startOfToday()
  const now = new Date()

  // Revenue (today's served orders)
  const { data: todayOrders = [] } = await supabase
    .from('orders')
    .select('total_amount, status, items')
    .eq('status', 'served')
    .gte('served_at', today.toISOString())
  const revenue = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const covers = todayOrders.length
  const avgTicket = covers > 0 ? Math.round(revenue / covers) : 0

  const itemCounts = {}
  for (const order of todayOrders) {
    for (const item of order.items || []) {
      const key = item.name_en || item.sku || 'unknown'
      itemCounts[key] = (itemCounts[key] || 0) + (item.qty || 1)
    }
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, sold]) => ({ name, sold }))

  // Historical baseline
  const baseline = await getHistoricalBaseline()
  const weekday = now.getDay()
  const typicalToday = baseline.byWeekday[weekday] || 0
  const vsTypical = typicalToday > 0 ? Math.round(((revenue - typicalToday) / typicalToday) * 100) : null

  // Inventory
  const { data: inventoryRows = [] } = await supabase.from('inventory').select('*')
  const inventory = inventoryRows.map((item) => {
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    return {
      name: item.name_en,
      stock: item.current_stock,
      unit: item.unit,
      threshold: item.par_level,
      status: hoursRemaining !== null && hoursRemaining <= 6 ? 'at_risk' : 'ok',
      hoursRemaining: hoursRemaining !== null ? Math.round(hoursRemaining) : null,
    }
  })

  // Tables
  const { data: tablesRows = [] } = await supabase.from('tables').select('table_id, status')
  const tables = tablesRows.map((t) => ({ id: t.table_id, status: t.status }))
  const occupiedCount = tables.filter((t) => t.status === 'dining' || t.status === 'reserved').length

  // Kitchen queue
  const { data: queueRows = [] } = await supabase.from('kitchen_queue').select('*')
  const pendingCount = queueRows.filter((q) => q.status === 'pending').length
  const inKitchenItems = queueRows.filter((q) => q.status === 'in_progress' || q.status === 'in_kitchen')
  const delayedCount = inKitchenItems.filter((q) => {
    const queuedAt = toDate(q.queued_at)
    return queuedAt && (now - queuedAt) / 60000 > 20
  }).length

  // Staff shifts
  const { data: shiftsRows = [] } = await supabase.from('staff_shifts').select('shift_start, shift_end')
  const onShiftNow = shiftsRows.filter((s) => {
    const start = toDate(s.shift_start)
    const end = toDate(s.shift_end)
    return start && end && start <= now && now <= end
  })

  // Reservations (today)
  const { data: allReservations = [] } = await supabase.from('reservations').select('*')
  const todayReservations = allReservations.filter((r) => {
    const t = toDate(r.reservation_time)
    return t && t >= today
  })
  const confirmedToday = todayReservations.filter((r) => r.status === 'confirmed')
  const nextArrival = confirmedToday
    .map((r) => toDate(r.reservation_time))
    .filter((t) => t && t > now)
    .sort((a, b) => a - b)[0]

  // Loyalty (derived from all reservations)
  const guestVisits = {}
  for (const r of allReservations) {
    if (r.status === 'cancelled') continue
    guestVisits[r.guest_name] = (guestVisits[r.guest_name] || 0) + 1
  }
  const repeatGuests = Object.values(guestVisits).filter((v) => v >= 2)
  const totalMembers = repeatGuests.length
  const atRiskCount = repeatGuests.filter((v) => v < 4).length
  const avgVisitsPerMonth =
    totalMembers > 0 ? Math.round(repeatGuests.reduce((s, v) => s + v, 0) / totalMembers) : 0

  // Insights
  const { data: insightRows = [] } = await supabase.from('insights').select('status, summary_en')
  const activeInsights = insightRows
    .filter((i) => i.status !== 'acted_on')
    .map((i) => i.summary_en)

  const dataSnapshot = {
    today: {
      revenue: {
        total: revenue,
        vsTypicalPct: vsTypical,
        historicalAvg: typicalToday,
        byChannel: STATIC_CHANNELS,
      },
      covers,
      avgTicket,
      tablesOccupied: occupiedCount,
      totalTables: tables.length,
      activeAlerts: activeInsights.length,
    },
    inventory: inventory.map(({ name, stock, unit, threshold, status, hoursRemaining }) => ({
      name, stock, unit, threshold, status, hoursRemaining,
    })),
    tables: tables.map(({ id, status }) => ({ id, status })),
    orders: {
      pending: pendingCount,
      inKitchen: inKitchenItems.length,
      delayed: delayedCount,
    },
    staff: {
      onShiftNow: onShiftNow.length,
      scheduledToday: shiftsRows.length,
    },
    reservations: {
      todayCount: todayReservations.length,
      confirmedCount: confirmedToday.length,
      nextArrival: nextArrival
        ? nextArrival.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : null,
      peakForecast: '18:30–20:00 based on historical booking patterns',
    },
    suppliers: STATIC_SUPPLIERS,
    loyalty: { totalMembers, atRiskCount, avgVisitsPerMonth },
    topItems,
  }

  const atRiskInv = inventory.filter((i) => i.status === 'at_risk')

  return [
    `=== RESTAURANT OPERATIONS SNAPSHOT (${now.toLocaleString('en-US')}) ===`,
    '',
    `REVENUE: ${revenue.toLocaleString('en-US')} VND today (${covers} covers, avg ticket ${avgTicket.toLocaleString('en-US')} VND).`,
    typicalToday > 0
      ? `vs. historical average for this weekday: ${typicalToday.toLocaleString('en-US')} VND (${vsTypical >= 0 ? '+' : ''}${vsTypical}%).`
      : 'No historical baseline available yet.',
    '',
    `TABLES: ${occupiedCount}/${tables.length} occupied. Status breakdown: ${
      ['open', 'reserved', 'dining', 'cleanup']
        .map((s) => `${s}: ${tables.filter((t) => t.status === s).length}`)
        .join(', ')
    }.`,
    '',
    `KITCHEN QUEUE: ${pendingCount} pending, ${inKitchenItems.length} in kitchen, ${delayedCount} delayed (>20 min).`,
    '',
    `STAFF: ${onShiftNow.length} on shift now out of ${shiftsRows.length} scheduled today.`,
    '',
    `RESERVATIONS: ${todayReservations.length} today (${confirmedToday.length} confirmed). Next arrival: ${
      nextArrival ? nextArrival.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'none'
    }. Peak forecast: 18:30–20:00.`,
    '',
    `INVENTORY: ${
      atRiskInv.length > 0
        ? `AT RISK — ${atRiskInv.map((i) => `${i.name} (${i.stock} ${i.unit}, ~${i.hoursRemaining}h left)`).join('; ')}.`
        : 'All items OK.'
    }`,
    '',
    `SALES CHANNELS (today, sample): ${STATIC_CHANNELS.map((c) => `${c.name}: ${c.orders} orders, ${c.revenue.toLocaleString('en-US')} VND`).join(' | ')}.`,
    '',
    `SUPPLIERS: ${STATIC_SUPPLIERS.map((s) => `${s.name} (${s.reliability}% on-time${s.nextShortfall ? `, shortfall risk: ${s.nextShortfall}` : ''})`).join(' | ')}.`,
    '',
    `LOYALTY: ${totalMembers} repeat members tracked. ${atRiskCount} at risk of churn (< 4 visits). Avg ${avgVisitsPerMonth} visits/member.`,
    '',
    topItems.length > 0
      ? `TOP ITEMS TODAY: ${topItems.map((i) => `${i.name} (${i.sold} sold)`).join(', ')}.`
      : 'No completed orders yet today.',
    '',
    activeInsights.length > 0
      ? `ACTIVE AI INSIGHTS: ${activeInsights.join(' | ')}.`
      : 'No active AI-generated insights.',
    '',
    `RAW JSON (for precise queries): ${JSON.stringify(dataSnapshot)}`,
  ].join('\n')
}

export async function clearMessages(req, res) {
  const { error } = await supabase
    .from('consultant_messages')
    .delete()
    .eq('user_id', req.user.uid)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
}

export async function sendMessage(req, res) {
  const { message } = req.body
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  // Check user role
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('uid', req.user.uid)
    .single()
  const role = userRow?.role ?? null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can use the AI Consultant' })
  }

  // Save user message
  const { error: saveErr } = await supabase.from('consultant_messages').insert({
    id: crypto.randomUUID(),
    user_id: req.user.uid,
    role: 'user',
    content: message,
    created_at: new Date().toISOString(),
  })
  if (saveErr) return res.status(500).json({ error: saveErr.message })

  // Fetch recent history
  const { data: historyRows } = await supabase
    .from('consultant_messages')
    .select('role, content')
    .eq('user_id', req.user.uid)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  const history = (historyRows || []).reverse().map((m) => ({ role: m.role, content: m.content }))

  let snapshot
  try {
    snapshot = await buildDataSnapshot()
  } catch (err) {
    console.error('buildDataSnapshot failed:', err.message)
    snapshot = '(Live data snapshot unavailable — answer based on general restaurant operations knowledge.)'
  }

  let reply
  try {
    reply = await getChatCompletion([
      {
        role: 'system',
        content: `You are an AI Operations Consultant for Pang Pang Restaurant, a Thai casual dining restaurant. Help the owner understand what is happening in their business and why. Answer only in English. Be concise and specific, referencing the data below when relevant.\n\n${snapshot}`,
      },
      ...history,
    ])
  } catch (err) {
    return res.status(502).json({ error: 'AI Consultant is temporarily unavailable' })
  }

  // Save assistant reply
  const { error: replyErr } = await supabase.from('consultant_messages').insert({
    id: crypto.randomUUID(),
    user_id: req.user.uid,
    role: 'assistant',
    content: reply,
    created_at: new Date().toISOString(),
  })
  if (replyErr) console.error('failed to save assistant reply:', replyErr.message)

  res.json({ reply })
}
```

- [ ] **Step 2: Verify no `db` import remains**

```bash
grep -n "firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/controllers/consultantController.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/controllers/consultantController.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: migrate consultantController fully to Supabase"
```

---

### Task 9: Create seedSupabase.js

**Files:**
- Create: `src/scripts/seedSupabase.js`

**Interfaces:**
- Consumes: `supabase` client, no Firestore
- Seeds: tables, menu_items, inventory, staff_shifts, kitchen_queue, reservations, users, analytics_baseline
- Does NOT touch `orders` table

- [ ] **Step 1: Write the file**

```js
// src/scripts/seedSupabase.js
// Seeds all Supabase tables with fresh operational data.
// Does NOT touch the orders table (2000 historical rows already there).
// Run: node src/scripts/seedSupabase.js
import 'dotenv/config'
import { supabase } from '../supabaseClient.js'

const today = new Date()
function hoursFromNow(h) { return new Date(today.getTime() + h * 60 * 60 * 1000).toISOString() }
function hoursAgo(h) { return hoursFromNow(-h) }

async function upsertAll(table, rows, conflictCol) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCol })
  if (error) { console.error(`  ERROR seeding ${table}:`, error.message); process.exit(1) }
  console.log(`  Seeded ${rows.length} rows into "${table}"`)
}

// ── Tables ─────────────────────────────────────────────────────────────────
const tables = [
  { table_id: 'T01', capacity: 2, status: 'open',     seated_at: null },
  { table_id: 'T02', capacity: 2, status: 'dining',   seated_at: hoursAgo(1) },
  { table_id: 'T03', capacity: 4, status: 'open',     seated_at: null },
  { table_id: 'T04', capacity: 4, status: 'dining',   seated_at: hoursAgo(0.5) },
  { table_id: 'T05', capacity: 4, status: 'reserved', seated_at: null },
  { table_id: 'T06', capacity: 4, status: 'open',     seated_at: null },
  { table_id: 'T07', capacity: 6, status: 'dining',   seated_at: hoursAgo(0.75) },
  { table_id: 'T08', capacity: 6, status: 'cleanup',  seated_at: hoursAgo(2) },
  { table_id: 'T09', capacity: 2, status: 'open',     seated_at: null },
  { table_id: 'T10', capacity: 4, status: 'dining',   seated_at: hoursAgo(0.25) },
  { table_id: 'T11', capacity: 8, status: 'open',     seated_at: null },
  { table_id: 'T12', capacity: 8, status: 'reserved', seated_at: null },
]
await upsertAll('tables', tables, 'table_id')

// ── Menu items ─────────────────────────────────────────────────────────────
const menu_items = [
  { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',          name_vi: 'Bò xào húng quế', unit_price: 110000 },
  { sku: 'MENU-CHICKENCURRY', name_en: 'Green Curry Chicken', name_vi: 'Cà ri xanh gà',   unit_price: 105000 },
  { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',        name_vi: 'Canh Tom Yum',     unit_price: 120000 },
  { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai Shrimp',     name_vi: 'Pad Thai tôm',     unit_price:  95000 },
  { sku: 'MENU-MANGORICE',    name_en: 'Mango Sticky Rice',   name_vi: 'Xôi xoài',         unit_price:  65000 },
]
await upsertAll('menu_items', menu_items, 'sku')

// ── Inventory (8 items, ingredient SKUs match menu.js) ─────────────────────
const inventory = [
  { sku: 'INV-BEEF-01',   name_en: 'Beef Sirloin',  name_vi: 'Thăn bò',       unit: 'kg', current_stock: 9,   par_level: 12, avg_daily_consumption: 10, cost_per_unit: 320000, last_restocked_at: hoursAgo(20) },
  { sku: 'INV-CHK-01',    name_en: 'Chicken Thigh', name_vi: 'Đùi gà',        unit: 'kg', current_stock: 4.5, par_level: 15, avg_daily_consumption: 18, cost_per_unit: 85000,  last_restocked_at: hoursAgo(20) },
  { sku: 'INV-SHRIMP-01', name_en: 'Shrimp',        name_vi: 'Tôm',           unit: 'kg', current_stock: 1.2, par_level:  8, avg_daily_consumption:  9, cost_per_unit: 210000, last_restocked_at: hoursAgo(30) },
  { sku: 'INV-RICE-01',   name_en: 'Jasmine Rice',  name_vi: 'Gạo thơm',      unit: 'kg', current_stock: 40,  par_level: 20, avg_daily_consumption: 15, cost_per_unit: 22000,  last_restocked_at: hoursAgo(10) },
  { sku: 'INV-BASIL-01',  name_en: 'Thai Basil',    name_vi: 'Húng quế Thái', unit: 'kg', current_stock: 0.8, par_level:  3, avg_daily_consumption:  2.5, cost_per_unit: 40000, last_restocked_at: hoursAgo(28) },
  { sku: 'INV-COCO-01',   name_en: 'Coconut Milk',  name_vi: 'Nước cốt dừa',  unit: 'L',  current_stock: 6,   par_level: 10, avg_daily_consumption:  8, cost_per_unit: 30000,  last_restocked_at: hoursAgo(20) },
  { sku: 'INV-MANGO-01',  name_en: 'Mango',         name_vi: 'Xoài',          unit: 'kg', current_stock: 5,   par_level:  8, avg_daily_consumption:  6, cost_per_unit: 35000,  last_restocked_at: hoursAgo(15) },
  { sku: 'INV-NOODLE-01', name_en: 'Rice Noodles',  name_vi: 'Bún gạo',       unit: 'kg', current_stock: 12,  par_level: 10, avg_daily_consumption:  8, cost_per_unit: 45000,  last_restocked_at: hoursAgo(12) },
]
await upsertAll('inventory', inventory, 'sku')

// ── Staff shifts (14 rows) ─────────────────────────────────────────────────
const staff_shifts = [
  { staff_id: 'S0',  name: 'Linh Do',     role: 'manager',           shift: 'A', shift_start: hoursAgo(5),  shift_end: hoursFromNow(3),  station: 'office',  tasks_completed: 12 },
  { staff_id: 'S1',  name: 'Minh Tran',   role: 'chef',              shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursFromNow(4),  station: 'wok',     tasks_completed: 22 },
  { staff_id: 'S2',  name: 'Anh Le',      role: 'chef',              shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursFromNow(4),  station: 'grill',   tasks_completed: 19 },
  { staff_id: 'S3',  name: 'Bao Nguyen',  role: 'kitchen_assistant', shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursFromNow(4),  station: 'prep',    tasks_completed: 27 },
  { staff_id: 'S4',  name: 'Lan Pham',    role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursFromNow(5),  station: 'floor',   tasks_completed: 31 },
  { staff_id: 'S5',  name: 'Huy Nguyen',  role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursFromNow(5),  station: 'floor',   tasks_completed: 18 },
  { staff_id: 'S10', name: 'Nhi Truong',  role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursFromNow(5),  station: 'cashier', tasks_completed: 24 },
  { staff_id: 'S12', name: 'Hang Nguyen', role: 'cleaner',           shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursFromNow(4),  station: 'hall',    tasks_completed: 8 },
  { staff_id: 'S6',  name: 'Tuan Vo',     role: 'chef',              shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'wok',   tasks_completed: 0 },
  { staff_id: 'S7',  name: 'Dung Hoang',  role: 'kitchen_assistant', shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'prep',  tasks_completed: 0 },
  { staff_id: 'S8',  name: 'Mai Thi Thu', role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'floor', tasks_completed: 0 },
  { staff_id: 'S9',  name: 'Cuong Dinh',  role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'floor', tasks_completed: 0 },
  { staff_id: 'S11', name: 'Phuc Le',     role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'cashier', tasks_completed: 0 },
  { staff_id: 'S13', name: 'Son Pham',    role: 'cleaner',           shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12), station: 'hall',  tasks_completed: 0 },
]
await upsertAll('staff_shifts', staff_shifts, 'staff_id')

// ── Kitchen queue (1 item for today's pending order) ──────────────────────
const kitchen_queue = [
  {
    queue_id: 'KQ-001',
    order_id: 'LIVE-003',
    table_id: 'T07',
    item_sku: 'MENU-CHICKENCURRY',
    item_name: 'Green Curry Chicken',
    qty: 3,
    station: 'kitchen',
    status: 'in_progress',
    queued_at: hoursAgo(0.1),
    started_at: null,
    completed_at: null,
    prep_time_target_min: 15,
  },
]
await upsertAll('kitchen_queue', kitchen_queue, 'queue_id')

// ── Reservations (8 rows) ─────────────────────────────────────────────────
const reservations = [
  { reservation_id: 'R001', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T05', reservation_time: hoursFromNow(2),  status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R002', guest_name: 'Tran Thi B',   party_size: 8, table_id: 'T12', reservation_time: hoursFromNow(4),  status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R003', guest_name: 'Le Van C',     party_size: 2, table_id: 'T09', reservation_time: hoursFromNow(6),  status: 'confirmed', phone: '0923456789' },
  { reservation_id: 'R004', guest_name: 'Pham Thi D',   party_size: 4, table_id: 'T03', reservation_time: hoursFromNow(8),  status: 'confirmed', phone: '0934567890' },
  { reservation_id: 'R005', guest_name: 'Hoang Van E',  party_size: 6, table_id: 'T07', reservation_time: hoursAgo(24),     status: 'confirmed', phone: '0945678901' },
  { reservation_id: 'R006', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T04', reservation_time: hoursAgo(48),     status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R007', guest_name: 'Vu Thi F',     party_size: 2, table_id: 'T02', reservation_time: hoursAgo(72),     status: 'cancelled', phone: '0956789012' },
  { reservation_id: 'R008', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T11', reservation_time: hoursAgo(96),     status: 'confirmed', phone: '0912345678' },
]
await upsertAll('reservations', reservations, 'reservation_id')

// ── Users (admin placeholder) ─────────────────────────────────────────────
const users = [
  { uid: 'admin-seed', email: 'admin@pangpang.vn', role: 'admin' },
]
await upsertAll('users', users, 'uid')

// ── Analytics baseline: compute from existing Supabase orders ─────────────
console.log('\nComputing analytics_baseline from Supabase orders...')
const cutoff = new Date()
cutoff.setHours(0, 0, 0, 0)

const { data: allOrders, error: ordersErr } = await supabase
  .from('orders')
  .select('served_at, total_amount, status')
  .eq('status', 'served')
  .lt('served_at', cutoff.toISOString())
if (ordersErr) { console.error(ordersErr.message); process.exit(1) }

const dayRevenue = new Map()
const dayCountByWeekday = new Map()
const weekdayRevenue = new Map()
const hourRevenue = new Map()
const hourDayCount = new Map()

for (const order of allOrders || []) {
  const servedAt = new Date(order.served_at)
  const dateKey = servedAt.toDateString()
  const weekday = servedAt.getDay()
  const hour = servedAt.getHours()
  const amount = order.total_amount || 0

  dayRevenue.set(dateKey, (dayRevenue.get(dateKey) || 0) + amount)
  weekdayRevenue.set(weekday, (weekdayRevenue.get(weekday) || 0) + amount)
  hourRevenue.set(hour, (hourRevenue.get(hour) || 0) + amount)

  if (!dayCountByWeekday.has(weekday)) dayCountByWeekday.set(weekday, new Set())
  dayCountByWeekday.get(weekday).add(dateKey)

  if (!hourDayCount.has(hour)) hourDayCount.set(hour, new Set())
  hourDayCount.get(hour).add(dateKey)
}

const distinctDays = dayRevenue.size
const avgDailyRevenue = distinctDays > 0
  ? Math.round([...dayRevenue.values()].reduce((s, v) => s + v, 0) / distinctDays)
  : 0

const byWeekday = {}
for (let w = 0; w < 7; w++) {
  const days = dayCountByWeekday.get(w)?.size || 0
  byWeekday[w] = days > 0 ? Math.round((weekdayRevenue.get(w) || 0) / days) : 0
}

const byHour = {}
for (let h = 0; h < 24; h++) {
  const days = hourDayCount.get(h)?.size || 0
  byHour[h] = days > 0 ? Math.round((hourRevenue.get(h) || 0) / days) : 0
}

const { error: baselineErr } = await supabase
  .from('analytics_baseline')
  .upsert({
    id: 'historical_baseline',
    distinct_days: distinctDays,
    avg_daily_revenue: avgDailyRevenue,
    by_weekday: byWeekday,
    by_hour: byHour,
    computed_at: new Date().toISOString(),
  })
if (baselineErr) { console.error(baselineErr.message); process.exit(1) }

console.log(`  Computed baseline from ${(allOrders || []).length} orders across ${distinctDays} days.`)
console.log(`  avgDailyRevenue: ${avgDailyRevenue}`)
console.log('\nSupabase seed complete.')
process.exit(0)
```

- [ ] **Step 2: Verify file has no Firestore imports**

```bash
grep -n "firebaseAdmin\|firebase" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/scripts/seedSupabase.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/scripts/seedSupabase.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: add seedSupabase.js replacing resetFirestore.js"
```

---

### Task 10: Update server.js and inventoryController.js

**Files:**
- Modify: `src/server.js` — remove unused `db` import if present
- Modify: `src/controllers/inventoryController.js` — migrate `inventory` reads to Supabase

**Interfaces:**
- `server.js` — no functional change, just import cleanup
- `inventoryController.js` — `getForecast` reads from `supabase.from('inventory')`

- [ ] **Step 1: Update inventoryController.js**

```js
// src/controllers/inventoryController.js
import { supabase } from '../supabaseClient.js'

export async function getForecast(req, res) {
  const { data: rows, error } = await supabase.from('inventory').select('*')
  if (error) return res.status(500).json({ error: error.message })

  const now = Date.now()
  const forecast = (rows || []).map((item) => {
    const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
    const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
    const stockoutAt = hoursRemaining !== null ? new Date(now + hoursRemaining * 60 * 60 * 1000) : null

    return {
      sku: item.sku,
      name_en: item.name_en,
      name_vi: item.name_vi,
      unit: item.unit,
      current_stock: item.current_stock,
      par_level: item.par_level,
      hours_remaining: hoursRemaining !== null ? Math.round(hoursRemaining * 10) / 10 : null,
      stockout_at: stockoutAt,
      at_risk: hoursRemaining !== null && hoursRemaining <= 6,
    }
  })

  forecast.sort((a, b) => (a.hours_remaining ?? Infinity) - (b.hours_remaining ?? Infinity))
  res.json(forecast)
}
```

- [ ] **Step 2: Check server.js for db import**

```bash
grep -n "db\|firebaseAdmin" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/server.js
```

If `db` is imported there, remove only that import line. The file currently only imports `runAnalysisInternal` from insightsController and does not import `db`, so no change is likely needed.

- [ ] **Step 3: Verify no Firestore imports remain in any migrated controller/service**

```bash
grep -rn "from '../firebaseAdmin.js'" /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/controllers/ /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/services/ /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/scripts/seedSupabase.js /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend/src/scripts/computeHistoricalBaseline.js
```

Expected: no output (only `firebaseAdmin.js` itself and `requireAuth.js` should import from firebaseAdmin).

- [ ] **Step 4: Commit**

```bash
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend add src/controllers/inventoryController.js
git -C /Users/hgiang/Downloads/GROUP\ 13/FINAL/backend commit -m "feat: migrate inventoryController to Supabase; complete Firestore migration"
```
