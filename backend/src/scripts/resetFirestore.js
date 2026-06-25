// Full Firestore reset: deletes all collections then reseeds fresh operational data.
// Orders are now in Supabase — Firestore only holds live operational data.
// Run: node src/scripts/resetFirestore.js
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

async function deleteCollection(name) {
  const snap = await db.collection(name).get()
  if (snap.empty) { console.log(`  ${name}: already empty`); return }
  const BATCH = 400
  for (let i = 0; i < snap.docs.length; i += BATCH) {
    const batch = db.batch()
    snap.docs.slice(i, i + BATCH).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  console.log(`  Deleted ${snap.docs.length} docs from "${name}"`)
}

async function seedCollection(name, docs, idField) {
  const batch = db.batch()
  for (const doc of docs) {
    const ref = db.collection(name).doc(doc[idField])
    batch.set(ref, doc)
  }
  await batch.commit()
  console.log(`  Seeded ${docs.length} docs into "${name}"`)
}

const today = new Date()
function hoursAgo(h) { return new Date(today.getTime() - h * 60 * 60 * 1000) }

// ── Delete all collections ──────────────────────────────────────────────────
console.log('Deleting old collections...')
await deleteCollection('orders')         // now in Supabase
await deleteCollection('tables')
await deleteCollection('inventory')
await deleteCollection('staff_shifts')
await deleteCollection('menu_items')
await deleteCollection('kitchen_queue')
await deleteCollection('insights')
await deleteCollection('reservations')

// ── Tables (matching T01–T12 from Supabase orders) ────────────────────────
console.log('\nSeeding...')
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
await seedCollection('tables', tables, 'table_id')

// ── Menu items (matching Supabase order SKUs) ─────────────────────────────
const menuItems = [
  { sku: 'MENU-BEEFBASIL',    name_en: 'Basil Beef',            name_vi: 'Bò xào húng quế',    unit_price: 110000 },
  { sku: 'MENU-CHICKENCURRY', name_en: 'Green Curry Chicken',   name_vi: 'Cà ri xanh gà',      unit_price: 105000 },
  { sku: 'MENU-TOMYUM',       name_en: 'Tom Yum Soup',          name_vi: 'Canh Tom Yum',        unit_price: 120000 },
  { sku: 'MENU-PADTHAI',      name_en: 'Pad Thai Shrimp',       name_vi: 'Pad Thai tôm',        unit_price:  95000 },
  { sku: 'MENU-MANGORICE',    name_en: 'Mango Sticky Rice',     name_vi: 'Xôi xoài',            unit_price:  65000 },
]
await seedCollection('menu_items', menuItems, 'sku')

// ── Inventory ─────────────────────────────────────────────────────────────
const inventory = [
  { sku: 'INV-BEEF-01',   name_en: 'Beef Sirloin',    name_vi: 'Thăn bò',       unit: 'kg', current_stock: 9,   par_level: 12, avg_daily_consumption: 10, last_restocked_at: hoursAgo(20) },
  { sku: 'INV-CHK-01',    name_en: 'Chicken Thigh',   name_vi: 'Đùi gà',        unit: 'kg', current_stock: 4.5, par_level: 15, avg_daily_consumption: 18, last_restocked_at: hoursAgo(20) },
  { sku: 'INV-SHRIMP-01', name_en: 'Shrimp',          name_vi: 'Tôm',           unit: 'kg', current_stock: 1.2, par_level: 8,  avg_daily_consumption:  9, last_restocked_at: hoursAgo(30) },
  { sku: 'INV-RICE-01',   name_en: 'Jasmine Rice',    name_vi: 'Gạo thơm',      unit: 'kg', current_stock: 40,  par_level: 20, avg_daily_consumption: 15, last_restocked_at: hoursAgo(10) },
  { sku: 'INV-BASIL-01',  name_en: 'Thai Basil',      name_vi: 'Húng quế Thái', unit: 'kg', current_stock: 0.8, par_level:  3, avg_daily_consumption:  2.5, last_restocked_at: hoursAgo(28) },
  { sku: 'INV-COCO-01',   name_en: 'Coconut Milk',    name_vi: 'Nước cốt dừa',  unit: 'L',  current_stock: 6,   par_level: 10, avg_daily_consumption:  8, last_restocked_at: hoursAgo(20) },
  { sku: 'INV-MANGO-01',  name_en: 'Mango',           name_vi: 'Xoài',          unit: 'kg', current_stock: 5,   par_level:  8, avg_daily_consumption:  6, last_restocked_at: hoursAgo(15) },
  { sku: 'INV-NOODLE-01', name_en: 'Rice Noodles',    name_vi: 'Bún gạo',       unit: 'kg', current_stock: 12,  par_level: 10, avg_daily_consumption:  8, last_restocked_at: hoursAgo(12) },
]
await seedCollection('inventory', inventory, 'sku')

// ── Staff shifts ───────────────────────────────────────────────────────────
const staff_shifts = [
  { staff_id: 'S0',  name: 'Linh Do',      role: 'manager',           shift: 'A', shift_start: hoursAgo(5),  shift_end: hoursAgo(-3),  station: 'office',  tasks_completed: 12 },
  { staff_id: 'S1',  name: 'Minh Tran',    role: 'chef',              shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursAgo(-4),  station: 'wok',     tasks_completed: 22 },
  { staff_id: 'S2',  name: 'Anh Le',       role: 'chef',              shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursAgo(-4),  station: 'grill',   tasks_completed: 19 },
  { staff_id: 'S3',  name: 'Bao Nguyen',   role: 'kitchen_assistant', shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursAgo(-4),  station: 'prep',    tasks_completed: 27 },
  { staff_id: 'S4',  name: 'Lan Pham',     role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursAgo(-5),  station: 'floor',   tasks_completed: 31 },
  { staff_id: 'S5',  name: 'Huy Nguyen',   role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursAgo(-5),  station: 'floor',   tasks_completed: 18 },
  { staff_id: 'S10', name: 'Nhi Truong',   role: 'server',            shift: 'A', shift_start: hoursAgo(3),  shift_end: hoursAgo(-5),  station: 'cashier', tasks_completed: 24 },
  { staff_id: 'S12', name: 'Hang Nguyen',  role: 'cleaner',           shift: 'A', shift_start: hoursAgo(4),  shift_end: hoursAgo(-4),  station: 'hall',    tasks_completed: 8 },
  { staff_id: 'S6',  name: 'Tuan Vo',      role: 'chef',              shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'wok',     tasks_completed: 0 },
  { staff_id: 'S7',  name: 'Dung Hoang',   role: 'kitchen_assistant', shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'prep',    tasks_completed: 0 },
  { staff_id: 'S8',  name: 'Mai Thi Thu',  role: 'server',            shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'floor',   tasks_completed: 0 },
  { staff_id: 'S9',  name: 'Cuong Dinh',   role: 'server',            shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'floor',   tasks_completed: 0 },
  { staff_id: 'S11', name: 'Phuc Le',      role: 'server',            shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'cashier', tasks_completed: 0 },
  { staff_id: 'S13', name: 'Son Pham',     role: 'cleaner',           shift: 'B', shift_start: hoursAgo(-4), shift_end: hoursAgo(-12), station: 'hall',    tasks_completed: 0 },
]
await seedCollection('staff_shifts', staff_shifts, 'staff_id')

// ── Today's live orders (a few for the kitchen queue) ─────────────────────
const liveOrders = [
  { id: 'LIVE-001', table_id: 'T02', status: 'served',  channel: 'dine_in', items: [{ sku: 'MENU-PADTHAI', name_en: 'Pad Thai Shrimp', qty: 2, unit_price: 95000 }],                                                                     total_amount: 190000, payment_method: 'cash',  created_at: hoursAgo(1),    served_at: hoursAgo(0.5) },
  { id: 'LIVE-002', table_id: 'T04', status: 'served',  channel: 'dine_in', items: [{ sku: 'MENU-TOMYUM', name_en: 'Tom Yum Soup', qty: 2, unit_price: 120000 }, { sku: 'MENU-BEEFBASIL', name_en: 'Basil Beef', qty: 1, unit_price: 110000 }], total_amount: 350000, payment_method: 'card',  created_at: hoursAgo(0.75), served_at: hoursAgo(0.25) },
  { id: 'LIVE-003', table_id: 'T07', status: 'pending', channel: 'dine_in', items: [{ sku: 'MENU-CHICKENCURRY', name_en: 'Green Curry Chicken', qty: 3, unit_price: 105000 }],                                                            total_amount: 315000, payment_method: null,    created_at: hoursAgo(0.1),  served_at: null },
  { id: 'LIVE-004', table_id: 'T10', status: 'served',  channel: 'dine_in', items: [{ sku: 'MENU-MANGORICE', name_en: 'Mango Sticky Rice', qty: 2, unit_price: 65000 }, { sku: 'MENU-PADTHAI', name_en: 'Pad Thai Shrimp', qty: 1, unit_price: 95000 }], total_amount: 225000, payment_method: 'cash', created_at: hoursAgo(0.5), served_at: hoursAgo(0.1) },
]
await seedCollection('orders', liveOrders, 'id')

// ── Kitchen queue ──────────────────────────────────────────────────────────
const kitchen_queue = [
  { queue_id: 'KQ-001', order_id: 'LIVE-003', table_id: 'T07', item_name: 'Green Curry Chicken', qty: 3, status: 'in_progress', queued_at: hoursAgo(0.1), prep_time_target_min: 15 },
]
await seedCollection('kitchen_queue', kitchen_queue, 'queue_id')

// ── Reservations ───────────────────────────────────────────────────────────
const reservations = [
  { reservation_id: 'R001', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T05', reservation_time: hoursAgo(-2),  status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R002', guest_name: 'Tran Thi B',   party_size: 8, table_id: 'T12', reservation_time: hoursAgo(-4),  status: 'confirmed', phone: '0912345678' },
  { reservation_id: 'R003', guest_name: 'Le Van C',     party_size: 2, table_id: 'T09', reservation_time: hoursAgo(-6),  status: 'confirmed', phone: '0923456789' },
  { reservation_id: 'R004', guest_name: 'Pham Thi D',   party_size: 4, table_id: 'T03', reservation_time: hoursAgo(-8),  status: 'confirmed', phone: '0934567890' },
  { reservation_id: 'R005', guest_name: 'Hoang Van E',  party_size: 6, table_id: 'T07', reservation_time: hoursAgo(24),  status: 'confirmed', phone: '0945678901' },
  { reservation_id: 'R006', guest_name: 'Nguyen Van A', party_size: 4, table_id: 'T04', reservation_time: hoursAgo(48),  status: 'confirmed', phone: '0901234567' },
  { reservation_id: 'R007', guest_name: 'Vu Thi F',     party_size: 2, table_id: 'T02', reservation_time: hoursAgo(72),  status: 'cancelled', phone: '0956789012' },
  { reservation_id: 'R008', guest_name: 'Tran Thi B',   party_size: 6, table_id: 'T11', reservation_time: hoursAgo(96),  status: 'confirmed', phone: '0912345678' },
]
await seedCollection('reservations', reservations, 'reservation_id')

console.log('\nFirestore reset complete.')
process.exit(0)
