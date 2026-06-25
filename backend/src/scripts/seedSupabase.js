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
  { sku: 'INV-BEEF-01',   name_en: 'Beef Sirloin',  name_vi: 'Thăn bò',       unit: 'kg', current_stock: 9,   par_level: 12, avg_daily_consumption: 10,  cost_per_unit: 320000, last_restocked_at: hoursAgo(20) },
  { sku: 'INV-CHK-01',    name_en: 'Chicken Thigh', name_vi: 'Đùi gà',        unit: 'kg', current_stock: 4.5, par_level: 15, avg_daily_consumption: 18,  cost_per_unit: 85000,  last_restocked_at: hoursAgo(20) },
  { sku: 'INV-SHRIMP-01', name_en: 'Shrimp',        name_vi: 'Tôm',           unit: 'kg', current_stock: 1.2, par_level:  8, avg_daily_consumption:  9,  cost_per_unit: 210000, last_restocked_at: hoursAgo(30) },
  { sku: 'INV-RICE-01',   name_en: 'Jasmine Rice',  name_vi: 'Gạo thơm',      unit: 'kg', current_stock: 40,  par_level: 20, avg_daily_consumption: 15,  cost_per_unit: 22000,  last_restocked_at: hoursAgo(10) },
  { sku: 'INV-BASIL-01',  name_en: 'Thai Basil',    name_vi: 'Húng quế Thái', unit: 'kg', current_stock: 0.8, par_level:  3, avg_daily_consumption:  2.5, cost_per_unit: 40000,  last_restocked_at: hoursAgo(28) },
  { sku: 'INV-COCO-01',   name_en: 'Coconut Milk',  name_vi: 'Nước cốt dừa',  unit: 'L',  current_stock: 6,   par_level: 10, avg_daily_consumption:  8,  cost_per_unit: 30000,  last_restocked_at: hoursAgo(20) },
  { sku: 'INV-MANGO-01',  name_en: 'Mango',         name_vi: 'Xoài',          unit: 'kg', current_stock: 5,   par_level:  8, avg_daily_consumption:  6,  cost_per_unit: 35000,  last_restocked_at: hoursAgo(15) },
  { sku: 'INV-NOODLE-01', name_en: 'Rice Noodles',  name_vi: 'Bún gạo',       unit: 'kg', current_stock: 12,  par_level: 10, avg_daily_consumption:  8,  cost_per_unit: 45000,  last_restocked_at: hoursAgo(12) },
]
await upsertAll('inventory', inventory, 'sku')

// ── Staff shifts (14 rows) ─────────────────────────────────────────────────
const staff_shifts = [
  { staff_id: 'S0',  name: 'Linh Do',     role: 'manager',           shift: 'A', shift_start: hoursAgo(5),     shift_end: hoursFromNow(3),   station: 'office',  tasks_completed: 12 },
  { staff_id: 'S1',  name: 'Minh Tran',   role: 'chef',              shift: 'A', shift_start: hoursAgo(4),     shift_end: hoursFromNow(4),   station: 'wok',     tasks_completed: 22 },
  { staff_id: 'S2',  name: 'Anh Le',      role: 'chef',              shift: 'A', shift_start: hoursAgo(4),     shift_end: hoursFromNow(4),   station: 'grill',   tasks_completed: 19 },
  { staff_id: 'S3',  name: 'Bao Nguyen',  role: 'kitchen_assistant', shift: 'A', shift_start: hoursAgo(4),     shift_end: hoursFromNow(4),   station: 'prep',    tasks_completed: 27 },
  { staff_id: 'S4',  name: 'Lan Pham',    role: 'server',            shift: 'A', shift_start: hoursAgo(3),     shift_end: hoursFromNow(5),   station: 'floor',   tasks_completed: 31 },
  { staff_id: 'S5',  name: 'Huy Nguyen',  role: 'server',            shift: 'A', shift_start: hoursAgo(3),     shift_end: hoursFromNow(5),   station: 'floor',   tasks_completed: 18 },
  { staff_id: 'S10', name: 'Nhi Truong',  role: 'server',            shift: 'A', shift_start: hoursAgo(3),     shift_end: hoursFromNow(5),   station: 'cashier', tasks_completed: 24 },
  { staff_id: 'S12', name: 'Hang Nguyen', role: 'cleaner',           shift: 'A', shift_start: hoursAgo(4),     shift_end: hoursFromNow(4),   station: 'hall',    tasks_completed: 8 },
  { staff_id: 'S6',  name: 'Tuan Vo',     role: 'chef',              shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'wok',     tasks_completed: 0 },
  { staff_id: 'S7',  name: 'Dung Hoang',  role: 'kitchen_assistant', shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'prep',    tasks_completed: 0 },
  { staff_id: 'S8',  name: 'Mai Thi Thu', role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'floor',   tasks_completed: 0 },
  { staff_id: 'S9',  name: 'Cuong Dinh',  role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'floor',   tasks_completed: 0 },
  { staff_id: 'S11', name: 'Phuc Le',     role: 'server',            shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'cashier', tasks_completed: 0 },
  { staff_id: 'S13', name: 'Son Pham',    role: 'cleaner',           shift: 'B', shift_start: hoursFromNow(4), shift_end: hoursFromNow(12),  station: 'hall',    tasks_completed: 0 },
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
