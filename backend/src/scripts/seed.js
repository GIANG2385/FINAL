// One-off script to seed Firestore with mock operational data so the
// Dashboard / FOH / BOH screens have something to render before real
// POS input exists. See build instructions §9 step 5.
//
// Run with: node src/scripts/seed.js
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

if (!db) {
  console.error('Firestore not initialized — check FIREBASE_SERVICE_ACCOUNT in backend/.env')
  process.exit(1)
}

const today = new Date()
function hoursAgo(h) {
  return new Date(today.getTime() - h * 60 * 60 * 1000)
}

const tables = [
  { table_id: 'T1', capacity: 2, status: 'dining', seated_at: hoursAgo(1) },
  { table_id: 'T2', capacity: 4, status: 'open', seated_at: null },
  { table_id: 'T3', capacity: 4, status: 'reserved', seated_at: null },
  { table_id: 'T4', capacity: 2, status: 'cleanup', seated_at: hoursAgo(2) },
  { table_id: 'T5', capacity: 6, status: 'dining', seated_at: hoursAgo(0.5) },
  { table_id: 'T6', capacity: 2, status: 'open', seated_at: null },
  { table_id: 'T7', capacity: 4, status: 'dining', seated_at: hoursAgo(0.25) },
  { table_id: 'T8', capacity: 8, status: 'open', seated_at: null },
]

const inventory = [
  { sku: 'TH-CHK-01', name_en: 'Chicken Thigh', name_vi: 'Đùi gà', unit: 'kg', current_stock: 4.5, par_level: 15, avg_daily_consumption: 18, last_restocked_at: hoursAgo(20) },
  { sku: 'TH-BEEF-01', name_en: 'Beef Sirloin', name_vi: 'Thăn bò', unit: 'kg', current_stock: 9, par_level: 12, avg_daily_consumption: 10, last_restocked_at: hoursAgo(20) },
  { sku: 'TH-SHRIMP-01', name_en: 'Shrimp', name_vi: 'Tôm', unit: 'kg', current_stock: 1.2, par_level: 8, avg_daily_consumption: 9, last_restocked_at: hoursAgo(30) },
  { sku: 'TH-RICE-01', name_en: 'Jasmine Rice', name_vi: 'Gạo thơm', unit: 'kg', current_stock: 40, par_level: 20, avg_daily_consumption: 15, last_restocked_at: hoursAgo(10) },
  { sku: 'TH-BASIL-01', name_en: 'Thai Basil', name_vi: 'Húng quế Thái', unit: 'kg', current_stock: 0.8, par_level: 3, avg_daily_consumption: 2.5, last_restocked_at: hoursAgo(28) },
  { sku: 'TH-COCO-01', name_en: 'Coconut Milk', name_vi: 'Nước cốt dừa', unit: 'L', current_stock: 6, par_level: 10, avg_daily_consumption: 8, last_restocked_at: hoursAgo(20) },
]

const staff_shifts = [
  { staff_id: 'S1', name: 'Minh Tran', role: 'chef', shift_start: hoursAgo(4), shift_end: hoursAgo(-4), station: 'wok', tasks_completed: 22 },
  { staff_id: 'S2', name: 'Lan Pham', role: 'server', shift_start: hoursAgo(3), shift_end: hoursAgo(-5), station: 'floor', tasks_completed: 31 },
  { staff_id: 'S3', name: 'Huy Nguyen', role: 'server', shift_start: hoursAgo(3), shift_end: hoursAgo(-5), station: 'floor', tasks_completed: 18 },
  { staff_id: 'S4', name: 'Anh Le', role: 'chef', shift_start: hoursAgo(4), shift_end: hoursAgo(-4), station: 'grill', tasks_completed: 19 },
]

const menuItems = [
  { sku: 'M-PAD-THAI', name_en: 'Pad Thai', name_vi: 'Pad Thái', unit_price: 95000 },
  { sku: 'M-GREEN-CURRY', name_en: 'Green Curry', name_vi: 'Cà ri xanh', unit_price: 120000 },
  { sku: 'M-TOM-YUM', name_en: 'Tom Yum Soup', name_vi: 'Súp Tom Yum', unit_price: 85000 },
  { sku: 'M-MANGO-STICKY', name_en: 'Mango Sticky Rice', name_vi: 'Xôi xoài', unit_price: 60000 },
  { sku: 'M-SPRING-ROLL', name_en: 'Spring Rolls', name_vi: 'Chả giò', unit_price: 50000 },
]

function randomItems() {
  const count = 1 + Math.floor(Math.random() * 3)
  const items = []
  for (let i = 0; i < count; i++) {
    const menuItem = menuItems[Math.floor(Math.random() * menuItems.length)]
    const qty = 1 + Math.floor(Math.random() * 2)
    items.push({ ...menuItem, qty })
  }
  return items
}

const channels = ['dine_in', 'dine_in', 'dine_in', 'delivery', 'reservation']
const statuses = ['served', 'served', 'served', 'in_kitchen', 'open']
const paymentMethods = ['cash', 'card', 'momo']

const orders = Array.from({ length: 15 }).map((_, i) => {
  const items = randomItems()
  const total_amount = items.reduce((sum, it) => sum + it.unit_price * it.qty, 0)
  const created_at = hoursAgo(Math.random() * 6)
  const status = statuses[i % statuses.length]
  return {
    id: `ORD-${1000 + i}`,
    channel: channels[i % channels.length],
    items,
    table_id: `T${1 + (i % 8)}`,
    status,
    created_at,
    served_at: status === 'served' ? new Date(created_at.getTime() + 25 * 60 * 1000) : null,
    total_amount,
    payment_method: status === 'served' ? paymentMethods[i % paymentMethods.length] : null,
  }
})

async function seedCollection(name, docs, idField) {
  const batch = db.batch()
  docs.forEach((d) => {
    const id = idField ? d[idField] : undefined
    const ref = id ? db.collection(name).doc(id) : db.collection(name).doc()
    batch.set(ref, d)
  })
  await batch.commit()
  console.log(`Seeded ${docs.length} docs into "${name}"`)
}

await seedCollection('tables', tables, 'table_id')
await seedCollection('inventory', inventory, 'sku')
await seedCollection('staff_shifts', staff_shifts, 'staff_id')
await seedCollection('orders', orders, 'id')

console.log('Seed complete.')
process.exit(0)
