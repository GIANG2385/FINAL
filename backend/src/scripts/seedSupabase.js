/**
 * seedSupabase.js — Full operational seed for Pang Pang SmartOps
 *
 * Revenue targets (busy scenario the restaurant must hit to be profitable):
 *   Daily:   16.2M VND  (~22 orders × 735K avg)
 *   Weekly: 113.4M VND
 *   Monthly: 486M  VND
 *
 * Menu avg price: ~159K/dish · avg 4.6 dishes/order · avg order 735K
 *
 * Run: node src/scripts/seedSupabase.js
 */
import 'dotenv/config'
import { supabase } from '../supabaseClient.js'

const NOW = new Date()

function daysAgo(d, hour = 12, jitterMin = 0) {
  const base = new Date(NOW)
  base.setDate(base.getDate() - d)
  base.setHours(hour, Math.floor(Math.random() * 60 * jitterMin / 60), 0, 0)
  return base.toISOString()
}

function minutesFromNow(m) {
  return new Date(NOW.getTime() + m * 60 * 1000).toISOString()
}

async function upsertAll(table, rows, conflictCol) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCol })
  if (error) { console.error(`  ERROR seeding ${table}:`, error.message); process.exit(1) }
  console.log(`  ✓ ${rows.length} rows → "${table}"`)
}

// ── Menu items (prices calibrated for 735K avg order) ─────────────────────
const menu_items = [
  { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',          name_vi: 'Bò xào húng quế',  unit_price: 195000,
    recipes: [
      { ingredient_sku: 'INV-BEEF-01',  ingredient_name_en: 'Beef Sirloin', ingredient_name_vi: 'Thịt bò',     qty: 0.20, unit: 'kg' },
      { ingredient_sku: 'INV-BASIL-01', ingredient_name_en: 'Thai Basil',   ingredient_name_vi: 'Húng quế',    qty: 0.05, unit: 'kg' },
    ]},
  { sku: 'MENU-CHICKENCURRY', name_en: 'Chicken Curry',       name_vi: 'Cà ri gà',          unit_price: 185000,
    recipes: [
      { ingredient_sku: 'INV-CHK-01',  ingredient_name_en: 'Chicken Thigh', ingredient_name_vi: 'Đùi gà',       qty: 0.25, unit: 'kg' },
      { ingredient_sku: 'INV-COCO-01', ingredient_name_en: 'Coconut Milk',  ingredient_name_vi: 'Nước cốt dừa', qty: 0.15, unit: 'L'  },
    ]},
  { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',        name_vi: 'Súp Tom Yum',       unit_price: 165000,
    recipes: [
      { ingredient_sku: 'INV-SHRIMP-01', ingredient_name_en: 'Shrimp',     ingredient_name_vi: 'Tôm',      qty: 0.15, unit: 'kg' },
      { ingredient_sku: 'INV-BASIL-01',  ingredient_name_en: 'Thai Basil', ingredient_name_vi: 'Húng quế', qty: 0.03, unit: 'kg' },
    ]},
  { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai',            name_vi: 'Pad Thái',           unit_price: 155000,
    recipes: [
      { ingredient_sku: 'INV-SHRIMP-01', ingredient_name_en: 'Shrimp',       ingredient_name_vi: 'Tôm',     qty: 0.12, unit: 'kg' },
      { ingredient_sku: 'INV-NOODLE-01', ingredient_name_en: 'Rice Noodles', ingredient_name_vi: 'Bún gạo', qty: 0.10, unit: 'kg' },
    ]},
  { sku: 'MENU-MANGORICE',    name_en: 'Mango Sticky Rice',   name_vi: 'Xôi xoài',           unit_price: 95000,
    recipes: [
      { ingredient_sku: 'INV-RICE-01',  ingredient_name_en: 'Jasmine Rice', ingredient_name_vi: 'Gạo thơm', qty: 0.15, unit: 'kg' },
      { ingredient_sku: 'INV-MANGO-01', ingredient_name_en: 'Mango',        ingredient_name_vi: 'Xoài',     qty: 0.20, unit: 'kg' },
    ]},
]
await upsertAll('menu_items', menu_items, 'sku')

// ── Tables (8 active tables matching floor plan) ───────────────────────────
const tables = [
  { table_id: 'T01', capacity: 2, status: 'open',     seated_at: null },
  { table_id: 'T02', capacity: 2, status: 'dining',   seated_at: minutesFromNow(-55) },
  { table_id: 'T03', capacity: 4, status: 'cleanup',  seated_at: minutesFromNow(-110) },
  { table_id: 'T04', capacity: 4, status: 'dining',   seated_at: minutesFromNow(-35) },
  { table_id: 'T05', capacity: 4, status: 'reserved', seated_at: null },
  { table_id: 'T06', capacity: 4, status: 'open',     seated_at: null },
  { table_id: 'T07', capacity: 6, status: 'dining',   seated_at: minutesFromNow(-70) },
  { table_id: 'T08', capacity: 6, status: 'open',     seated_at: null },
]
await upsertAll('tables', tables, 'table_id')

// ── Inventory (consumption calibrated to busy scenario: 22 orders/day) ────
// Busy day item distribution across 22 orders × 4.6 dishes = ~100 dish servings:
//   Basil Beef 22% → 22 srv → beef 4.4kg, basil 1.1kg
//   Chicken Curry 26% → 26 srv → chicken 6.5kg, coco 3.9L
//   Tom Yum 20% → 20 srv → shrimp 3.0kg, basil 0.6kg
//   Pad Thai 20% → 20 srv → shrimp 2.4kg, noodle 2.0kg
//   Mango Rice 12% → 12 srv → rice 1.8kg, mango 2.4kg
// Total basil: 1.7kg, shrimp: 5.4kg — set current_stock to create realistic alerts
const inventory = [
  { sku: 'INV-BEEF-01',   name_en: 'Beef Sirloin',  name_vi: 'Thăn bò',        unit: 'kg', current_stock: 3.8,  par_level: 13,  avg_daily_consumption: 4.4,  cost_per_unit: 320000, last_restocked_at: daysAgo(1, 7) },
  { sku: 'INV-CHK-01',    name_en: 'Chicken Thigh', name_vi: 'Đùi gà',          unit: 'kg', current_stock: 12.0, par_level: 18,  avg_daily_consumption: 6.5,  cost_per_unit: 85000,  last_restocked_at: daysAgo(0, 6) },
  { sku: 'INV-SHRIMP-01', name_en: 'Shrimp',        name_vi: 'Tôm',             unit: 'kg', current_stock: 2.1,  par_level: 14,  avg_daily_consumption: 5.4,  cost_per_unit: 210000, last_restocked_at: daysAgo(1, 8) },
  { sku: 'INV-RICE-01',   name_en: 'Jasmine Rice',  name_vi: 'Gạo thơm',        unit: 'kg', current_stock: 18.0, par_level: 10,  avg_daily_consumption: 1.8,  cost_per_unit: 22000,  last_restocked_at: daysAgo(3, 7) },
  { sku: 'INV-BASIL-01',  name_en: 'Thai Basil',    name_vi: 'Húng quế Thái',   unit: 'kg', current_stock: 0.9,  par_level: 5,   avg_daily_consumption: 1.7,  cost_per_unit: 40000,  last_restocked_at: daysAgo(2, 7) },
  { sku: 'INV-COCO-01',   name_en: 'Coconut Milk',  name_vi: 'Nước cốt dừa',    unit: 'L',  current_stock: 9.5,  par_level: 12,  avg_daily_consumption: 3.9,  cost_per_unit: 30000,  last_restocked_at: daysAgo(1, 7) },
  { sku: 'INV-MANGO-01',  name_en: 'Mango',         name_vi: 'Xoài',             unit: 'kg', current_stock: 6.2,  par_level: 8,   avg_daily_consumption: 2.4,  cost_per_unit: 35000,  last_restocked_at: daysAgo(1, 6) },
  { sku: 'INV-NOODLE-01', name_en: 'Rice Noodles',  name_vi: 'Bún gạo',          unit: 'kg', current_stock: 5.5,  par_level: 7,   avg_daily_consumption: 2.0,  cost_per_unit: 45000,  last_restocked_at: daysAgo(2, 7) },
]
await upsertAll('inventory', inventory, 'sku')

// ── Staff shifts (13 staff, labor 145–165M/month) ─────────────────────────
const h = (offset) => new Date(NOW.getTime() + offset * 3600000).toISOString()
const staff_shifts = [
  { staff_id: 'S0',  name: 'Linh Do',      role: 'manager',           shift: 'A', shift_start: h(-5),  shift_end: h(3),   station: 'office',  tasks_completed: 14 },
  { staff_id: 'S1',  name: 'Minh Tran',    role: 'chef',              shift: 'A', shift_start: h(-4),  shift_end: h(4),   station: 'wok',     tasks_completed: 28 },
  { staff_id: 'S2',  name: 'Anh Le',       role: 'chef',              shift: 'A', shift_start: h(-4),  shift_end: h(4),   station: 'grill',   tasks_completed: 24 },
  { staff_id: 'S3',  name: 'Bao Nguyen',   role: 'kitchen_assistant', shift: 'A', shift_start: h(-4),  shift_end: h(4),   station: 'prep',    tasks_completed: 31 },
  { staff_id: 'S4',  name: 'Lan Pham',     role: 'server',            shift: 'A', shift_start: h(-3),  shift_end: h(5),   station: 'floor',   tasks_completed: 38 },
  { staff_id: 'S5',  name: 'Huy Nguyen',   role: 'server',            shift: 'A', shift_start: h(-3),  shift_end: h(5),   station: 'floor',   tasks_completed: 22 },
  { staff_id: 'S10', name: 'Nhi Truong',   role: 'server',            shift: 'A', shift_start: h(-3),  shift_end: h(5),   station: 'cashier', tasks_completed: 29 },
  { staff_id: 'S12', name: 'Hang Nguyen',  role: 'cleaner',           shift: 'A', shift_start: h(-4),  shift_end: h(4),   station: 'hall',    tasks_completed: 11 },
  { staff_id: 'S6',  name: 'Tuan Vo',      role: 'chef',              shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'wok',     tasks_completed: 0  },
  { staff_id: 'S7',  name: 'Dung Hoang',   role: 'kitchen_assistant', shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'prep',    tasks_completed: 0  },
  { staff_id: 'S8',  name: 'Mai Thi Thu',  role: 'server',            shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'floor',   tasks_completed: 0  },
  { staff_id: 'S9',  name: 'Cuong Dinh',   role: 'server',            shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'floor',   tasks_completed: 0  },
  { staff_id: 'S11', name: 'Phuc Le',      role: 'server',            shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'cashier', tasks_completed: 0  },
  { staff_id: 'S13', name: 'Son Pham',     role: 'cleaner',           shift: 'B', shift_start: h(4),   shift_end: h(12),  station: 'hall',    tasks_completed: 0  },
]
await upsertAll('staff_shifts', staff_shifts, 'staff_id')

// ── Reservations ──────────────────────────────────────────────────────────
const reservations = [
  { reservation_id: 'R001', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T05', reservation_time: minutesFromNow(90),   status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R002', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T07', reservation_time: minutesFromNow(180),  status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R003', guest_name: 'Le Van C',     party_size: 2, table_id: 'T01', reservation_time: minutesFromNow(240),  status: 'confirmed', phone: '0923456789' },
  { reservation_id: 'R004', guest_name: 'Pham Thi D',   party_size: 4, table_id: 'T06', reservation_time: minutesFromNow(300),  status: 'confirmed', phone: '0934567890' },
  // Historical (for loyalty CRM)
  { reservation_id: 'R005', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T04', reservation_time: daysAgo(3, 19),  status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R006', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T04', reservation_time: daysAgo(7, 19),  status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R007', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T07', reservation_time: daysAgo(5, 18),  status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R008', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T07', reservation_time: daysAgo(12, 18), status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R009', guest_name: 'Hoang Van E',  party_size: 4, table_id: 'T04', reservation_time: daysAgo(2, 20),  status: 'confirmed', phone: '0945678901' },
  { reservation_id: 'R010', guest_name: 'Vu Thi F',     party_size: 2, table_id: 'T01', reservation_time: daysAgo(4, 19),  status: 'cancelled', phone: '0956789012' },
  { reservation_id: 'R011', guest_name: 'Le Van C',     party_size: 2, table_id: 'T02', reservation_time: daysAgo(8, 12),  status: 'confirmed', phone: '0923456789' },
  { reservation_id: 'R012', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T05', reservation_time: daysAgo(14, 19), status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R013', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T05', reservation_time: daysAgo(21, 19), status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R014', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T07', reservation_time: daysAgo(20, 18), status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R015', guest_name: 'Hoang Van E',  party_size: 4, table_id: 'T04', reservation_time: daysAgo(10, 20), status: 'confirmed', phone: '0945678901' },
  { reservation_id: 'R016', guest_name: 'Hoang Van E',  party_size: 4, table_id: 'T04', reservation_time: daysAgo(17, 20), status: 'confirmed', phone: '0945678901' },
]
await upsertAll('reservations', reservations, 'reservation_id')

// ── Users ─────────────────────────────────────────────────────────────────
await upsertAll('users', [{ uid: 'admin-seed', email: 'admin@pangpang.vn', role: 'admin' }], 'uid')

// ── Orders: 30-day history at busy-scenario volumes ───────────────────────
// Strategy:
//   Weekday (Mon-Thu): 18-22 orders/day  → avg 9-11M VND
//   Weekend (Fri-Sun): 22-28 orders/day  → avg 14-18M VND
//   Monthly total target: ~460-490M VND  (busy scenario ≈486M)
//
// Order composition: 3-6 dishes, realistic mix, avg 735K per order
//   Basil Beef 22% | Chicken Curry 26% | Tom Yum 20% | Pad Thai 20% | Mango Rice 12%

const MENU = [
  { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',        name_vi: 'Bò xào húng quế', unit_price: 195000, weight: 22 },
  { sku: 'MENU-CHICKENCURRY', name_en: 'Chicken Curry',     name_vi: 'Cà ri gà',         unit_price: 185000, weight: 26 },
  { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',      name_vi: 'Súp Tom Yum',      unit_price: 165000, weight: 20 },
  { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai',          name_vi: 'Pad Thái',          unit_price: 155000, weight: 20 },
  { sku: 'MENU-MANGORICE',    name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài',          unit_price: 95000,  weight: 12 },
]
const CHANNELS = ['dine_in', 'dine_in', 'dine_in', 'dine_in', 'delivery', 'reservation']
const PAYMENTS = ['cash', 'cash', 'card', 'momo']
const TABLES    = ['T01','T02','T03','T04','T05','T06','T07','T08']

let rng = 42
function rand() { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff }
function randInt(min, max) { return min + Math.floor(rand() * (max - min + 1)) }
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }

function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = rand() * total
  for (const item of items) { r -= item.weight; if (r <= 0) return item }
  return items[items.length - 1]
}

function buildOrder(id, tableId, dayOffset, hourOfDay) {
  const dishCount = randInt(3, 6)
  const items = Array.from({ length: dishCount }, () => {
    const m = weightedPick(MENU)
    return { sku: m.sku, name_en: m.name_en, name_vi: m.name_vi, unit_price: m.unit_price, qty: 1 }
  })
  const total_amount = items.reduce((s, i) => s + i.unit_price * i.qty, 0)

  const base = new Date(NOW)
  base.setDate(base.getDate() - dayOffset)
  base.setHours(hourOfDay, randInt(0, 59), randInt(0, 59), 0)
  const created_at = base.toISOString()
  const served_at  = new Date(base.getTime() + randInt(20, 40) * 60000).toISOString()

  return {
    id,
    table_id: tableId,
    channel: pick(CHANNELS),
    items,
    status: 'served',
    total_amount,
    created_at,
    served_at,
    payment_method: pick(PAYMENTS),
  }
}

// Service windows: lunch 11–14h, dinner 17–21h
const LUNCH_HOURS  = [11, 11, 12, 12, 12, 13, 13, 14]
const DINNER_HOURS = [17, 18, 18, 19, 19, 19, 20, 20, 21]

console.log('\nGenerating 30-day order history…')

// Wipe ALL existing orders so old seeds don't pollute revenue figures
const { error: delErr } = await supabase.from('orders').delete().neq('id', '__none__')
if (delErr) console.warn('  Could not delete old orders:', delErr.message)
else console.log('  Cleared all existing orders')
const cutoffISO = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).toISOString()

const allOrders = []
let orderId = 1

for (let dayOff = 30; dayOff >= 1; dayOff--) {
  const date = new Date(NOW)
  date.setDate(date.getDate() - dayOff)
  const dow = date.getDay() // 0=Sun, 6=Sat

  // Weekend (Fri=5, Sat=6, Sun=0) → busy; weekday → typical
  const isWeekend = dow === 0 || dow === 5 || dow === 6
  const targetOrders = isWeekend ? randInt(22, 28) : randInt(17, 22)

  const lunchCount  = Math.round(targetOrders * 0.45)
  const dinnerCount = targetOrders - lunchCount

  // ~25% of orders are takeaway (table_id = null)
  for (let i = 0; i < lunchCount; i++) {
    const isTakeaway = rand() < 0.25
    const tableId = isTakeaway ? null : TABLES[orderId % TABLES.length]
    allOrders.push(buildOrder(`ORD-H-${orderId++}`, tableId, dayOff, pick(LUNCH_HOURS)))
  }
  for (let i = 0; i < dinnerCount; i++) {
    const isTakeaway = rand() < 0.25
    const tableId = isTakeaway ? null : TABLES[orderId % TABLES.length]
    allOrders.push(buildOrder(`ORD-H-${orderId++}`, tableId, dayOff, pick(DINNER_HOURS)))
  }
}

// Today: lunch rush served (11 dine-in + 4 takeaway), dinner in progress
const todayServed = [
  // Lunch wave — dine-in
  ...[0,1,2,3,4,5,6,7,8,9,10].map((i) => {
    const tableId = TABLES[i % TABLES.length]
    const base = new Date(NOW)
    base.setHours(11 + Math.floor(i / 4), randInt(5, 55), 0, 0)
    const created_at = base.toISOString()
    const served_at  = new Date(base.getTime() + randInt(22, 38) * 60000).toISOString()
    const items = Array.from({ length: randInt(3, 5) }, () => {
      const m = weightedPick(MENU)
      return { sku: m.sku, name_en: m.name_en, name_vi: m.name_vi, unit_price: m.unit_price, qty: 1 }
    })
    return {
      id: `LIVE-SERVED-${i}`,
      table_id: tableId, channel: 'dine_in', items,
      status: 'served', total_amount: items.reduce((s, i) => s + i.unit_price, 0),
      created_at, served_at, payment_method: pick(PAYMENTS),
    }
  }),
  // Takeaway orders today
  ...[0,1,2,3].map((i) => {
    const base = new Date(NOW)
    base.setHours(11 + i, randInt(10, 50), 0, 0)
    const created_at = base.toISOString()
    const served_at  = new Date(base.getTime() + randInt(10, 20) * 60000).toISOString()
    const items = Array.from({ length: randInt(2, 4) }, () => {
      const m = weightedPick(MENU)
      return { sku: m.sku, name_en: m.name_en, name_vi: m.name_vi, unit_price: m.unit_price, qty: 1 }
    })
    return {
      id: `LIVE-TAKEAWAY-${i}`,
      table_id: null, channel: 'takeaway', items,
      status: 'served', total_amount: items.reduce((s, i) => s + i.unit_price, 0),
      created_at, served_at, payment_method: pick(PAYMENTS),
    }
  }),
]
allOrders.push(...todayServed)

// Active orders (currently running dinner service)
const liveOrders = [
  {
    id: 'LIVE-003', table_id: 'T07', channel: 'dine_in', status: 'in_kitchen',
    items: [
      { sku: 'MENU-CHICKENCURRY', name_en: 'Chicken Curry', name_vi: 'Cà ri gà', unit_price: 185000, qty: 2 },
      { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',  name_vi: 'Súp Tom Yum', unit_price: 165000, qty: 1 },
      { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai',      name_vi: 'Pad Thái',    unit_price: 155000, qty: 1 },
    ],
    total_amount: 690000, created_at: minutesFromNow(-18), served_at: null, payment_method: null,
  },
  {
    id: 'LIVE-004', table_id: 'T02', channel: 'dine_in', status: 'in_kitchen',
    items: [
      { sku: 'MENU-BEEFBASIL',  name_en: 'Basil Beef',  name_vi: 'Bò xào húng quế', unit_price: 195000, qty: 2 },
      { sku: 'MENU-MANGORICE',  name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', unit_price: 95000, qty: 2 },
    ],
    total_amount: 580000, created_at: minutesFromNow(-12), served_at: null, payment_method: null,
  },
  {
    id: 'LIVE-005', table_id: 'T04', channel: 'dine_in', status: 'open',
    items: [
      { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai',      name_vi: 'Pad Thái',    unit_price: 155000, qty: 3 },
      { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',    name_vi: 'Bò xào húng quế', unit_price: 195000, qty: 1 },
    ],
    total_amount: 660000, created_at: minutesFromNow(-5), served_at: null, payment_method: null,
  },
]
allOrders.push(...liveOrders)

// Upsert in batches of 500 to avoid payload limits
const BATCH = 500
for (let i = 0; i < allOrders.length; i += BATCH) {
  const batch = allOrders.slice(i, i + BATCH)
  const { error } = await supabase.from('orders').upsert(batch, { onConflict: 'id' })
  if (error) { console.error(`  ERROR inserting orders batch ${i}:`, error.message); process.exit(1) }
  console.log(`  ✓ Orders batch ${Math.floor(i/BATCH)+1}: ${batch.length} rows`)
}

// Print revenue summary
const historicalServed = allOrders.filter(o => o.status === 'served')
const todayRevenue = historicalServed
  .filter(o => new Date(o.created_at) >= new Date(cutoffISO))
  .reduce((s, o) => s + o.total_amount, 0)

const weekCutoff = new Date(NOW.getTime() - 7 * 24 * 3600000).toISOString()
const weekRevenue = historicalServed
  .filter(o => o.created_at >= weekCutoff)
  .reduce((s, o) => s + o.total_amount, 0)

const monthRevenue = historicalServed.reduce((s, o) => s + o.total_amount, 0)

console.log(`\n Revenue summary:`)
console.log(`   Today served:  ₫${(todayRevenue/1e6).toFixed(1)}M  (target ≥9M typical, ≥16.2M busy)`)
console.log(`   Last 7 days:   ₫${(weekRevenue/1e6).toFixed(1)}M  (target ≥113M busy)`)
console.log(`   Last 30 days:  ₫${(monthRevenue/1e6).toFixed(1)}M  (target ≥486M busy)`)
console.log(`   Total orders:  ${allOrders.length}`)

// ── Analytics baseline ─────────────────────────────────────────────────────
const dayRevMap = new Map()
const wdRev = new Map(), wdCount = new Map()
const hrRev = new Map(), hrCount = new Map()

for (const o of historicalServed) {
  const d = new Date(o.created_at)
  const dk = d.toDateString(), wd = d.getDay(), hr = d.getHours()
  dayRevMap.set(dk, (dayRevMap.get(dk) || 0) + o.total_amount)
  wdRev.set(wd, (wdRev.get(wd) || 0) + o.total_amount)
  wdCount.set(wd, (wdCount.get(wd) || 0) + 1)
  hrRev.set(hr, (hrRev.get(hr) || 0) + o.total_amount)
  hrCount.set(hr, (hrCount.get(hr) || 0) + 1)
}

const distinctDays = dayRevMap.size
const avgDailyRevenue = distinctDays > 0
  ? Math.round([...dayRevMap.values()].reduce((s, v) => s + v, 0) / distinctDays) : 0

const byWeekday = {}
for (let w = 0; w < 7; w++) {
  byWeekday[w] = wdCount.get(w) > 0 ? Math.round((wdRev.get(w)||0) / wdCount.get(w)) : 0
}
const byHour = {}
for (let hr = 0; hr < 24; hr++) {
  byHour[hr] = hrCount.get(hr) > 0 ? Math.round((hrRev.get(hr)||0) / hrCount.get(hr)) : 0
}

const { error: blErr } = await supabase.from('analytics_baseline').upsert({
  id: 'historical_baseline',
  distinct_days: distinctDays,
  avg_daily_revenue: avgDailyRevenue,
  by_weekday: byWeekday,
  by_hour: byHour,
  computed_at: new Date().toISOString(),
})
if (blErr) console.warn('  Analytics baseline error:', blErr.message)
else console.log(`\n  ✓ Analytics baseline: avgDaily=₫${(avgDailyRevenue/1e6).toFixed(1)}M over ${distinctDays} days`)

// ── Kitchen queue for active orders ───────────────────────────────────────
const kitchen_queue = [
  { queue_id: 'KQ-001', order_id: 'LIVE-003', table_id: 'T07', item_sku: 'MENU-CHICKENCURRY', item_name: 'Chicken Curry', item_name_vi: 'Cà ri gà', item_name_en: 'Chicken Curry', qty: 2, station: 'kitchen', status: 'in_progress', queued_at: minutesFromNow(-18), started_at: minutesFromNow(-10), completed_at: null, prep_time_target_min: 15 },
  { queue_id: 'KQ-002', order_id: 'LIVE-003', table_id: 'T07', item_sku: 'MENU-TOMYUM',       item_name: 'Tom Yum Soup',  item_name_vi: 'Súp Tom Yum', item_name_en: 'Tom Yum Soup', qty: 1, station: 'kitchen', status: 'pending',     queued_at: minutesFromNow(-18), started_at: null, completed_at: null, prep_time_target_min: 10 },
  { queue_id: 'KQ-003', order_id: 'LIVE-004', table_id: 'T02', item_sku: 'MENU-BEEFBASIL',    item_name: 'Basil Beef',    item_name_vi: 'Bò xào húng quế', item_name_en: 'Basil Beef', qty: 2, station: 'kitchen', status: 'pending',     queued_at: minutesFromNow(-12), started_at: null, completed_at: null, prep_time_target_min: 12 },
]
await upsertAll('kitchen_queue', kitchen_queue, 'queue_id')

console.log('\nSeed complete ✓')
process.exit(0)
