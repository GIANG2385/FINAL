/**
 * generateJuneData.js
 *
 * Generates realistic June 2026 restaurant data:
 *   - 1,560 orders (1,170 dine-in + 390 takeaway) across June 1–30
 *   - ~210 reservations (dine-in guests only)
 *
 * Operating model:
 *   - 8 tables (T01–T08), avg dining time 60 min, 70% occupancy
 *   - Sessions: Lunch 11:00–14:00 | Dinner 18:00–22:00
 *   - Channels: dine_in 75% | takeaway 25% (own delivery, no third-party)
 *
 * Run: node backend/src/scripts/generateJuneData.js
 */
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABLES = ['T01','T02','T03','T04','T05','T06','T07','T08']

const MENU = [
  { sku:'M-PAD-THAI',     name_en:'Pad Thai',            name_vi:'Pad Thái',         unit_price:95000,  weight:30 },
  { sku:'M-TOM-YUM',      name_en:'Tom Yum Soup',        name_vi:'Súp Tom Yum',      unit_price:85000,  weight:25 },
  { sku:'M-GREEN-CURRY',  name_en:'Green Curry',         name_vi:'Cà ri xanh',       unit_price:120000, weight:20 },
  { sku:'M-MANGO-STICKY', name_en:'Mango Sticky Rice',   name_vi:'Xôi xoài',         unit_price:60000,  weight:15 },
  { sku:'M-SPRING-ROLL',  name_en:'Spring Rolls',        name_vi:'Chả giò',          unit_price:50000,  weight:10 },
]
const MENU_TOTAL_WEIGHT = MENU.reduce((s, m) => s + m.weight, 0)

const PAYMENT_METHODS = [
  { method:'cash', weight:40 },
  { method:'card', weight:35 },
  { method:'momo', weight:25 },
]
const PAYMENT_TOTAL = PAYMENT_METHODS.reduce((s, p) => s + p.weight, 0)

// Lunch: 11:00–14:00 | time offsets in minutes from 11:00
// Dinner: 18:00–22:00 | time offsets in minutes from 18:00
const LUNCH_SLOTS  = buildSlots([
  { start:0,   end:30,  weight:5  },  // 11:00–11:30 sparse
  { start:30,  end:150, weight:70 },  // 11:30–13:30 peak
  { start:150, end:180, weight:25 },  // 13:30–14:00 tapering
], 180)

const DINNER_SLOTS = buildSlots([
  { start:0,   end:60,  weight:15 },  // 18:00–19:00 building
  { start:60,  end:180, weight:60 },  // 19:00–21:00 peak
  { start:180, end:240, weight:25 },  // 21:00–22:00 tapering
], 240)

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSlots(bands, totalMin) {
  const slots = []
  for (const b of bands) {
    const count = Math.round((b.weight / 100) * totalMin)
    for (let i = 0; i < count; i++) {
      slots.push(b.start + Math.random() * (b.end - b.start))
    }
  }
  return slots.sort((a, b) => a - b)
}

function weightedPick(items, totalWeight) {
  let r = Math.random() * totalWeight
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

function pickMenuItem() {
  return weightedPick(MENU, MENU_TOTAL_WEIGHT)
}

function pickPayment() {
  return weightedPick(PAYMENT_METHODS, PAYMENT_TOTAL).method
}

function pickItems() {
  // 1–4 items, weighted towards 2
  const counts = [1,2,2,3,3,4]
  const count = counts[Math.floor(Math.random() * counts.length)]
  const picked = []
  const used = new Set()
  for (let i = 0; i < count; i++) {
    let item
    let attempts = 0
    do {
      item = pickMenuItem()
      attempts++
    } while (used.has(item.sku) && attempts < 10)
    used.add(item.sku)
    const qty = Math.random() < 0.3 ? 2 : 1
    picked.push({ sku: item.sku, name_en: item.name_en, name_vi: item.name_vi, unit_price: item.unit_price, qty })
  }
  return picked
}

function jitter(minutes, rangeMins = 8) {
  return minutes + (Math.random() * 2 - 1) * rangeMins
}

// ── Main generator ─────────────────────────────────────────────────────────────

async function generateOrders() {
  const BATCH_SIZE = 400
  let orders = []
  let reservations = []

  const june = Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-06-01T00:00:00+07:00')
    d.setDate(d.getDate() + i)
    return d
  })

  // Pre-build table availability tracker per day (simple slot model)
  // We track when each table becomes free again (epoch ms)
  function makeTableTracker() {
    return Object.fromEntries(TABLES.map((t) => [t, 0]))
  }

  for (const day of june) {
    const tableTracker = makeTableTracker()

    // Lunch session: base 11:00 on this day (UTC+7 → UTC offset -7hrs in UTC)
    const lunchBase  = new Date(day)
    lunchBase.setHours(11, 0, 0, 0)
    const dinnerBase = new Date(day)
    dinnerBase.setHours(18, 0, 0, 0)

    // Target orders for this day with ±10% daily variation
    const variance = 0.9 + Math.random() * 0.2
    const dailyDineIn   = Math.round(39 * variance)
    const dailyTakeaway = Math.round(13 * variance)

    // Split dine-in between lunch (17/39) and dinner (22/39)
    const lunchDineIn  = Math.round(dailyDineIn * (17 / 39))
    const dinnerDineIn = dailyDineIn - lunchDineIn

    // ── Lunch dine-in orders ──
    for (let i = 0; i < lunchDineIn; i++) {
      const offsetMin = jitter(LUNCH_SLOTS[Math.floor(Math.random() * LUNCH_SLOTS.length)])
      const createdAt = new Date(lunchBase.getTime() + offsetMin * 60000)

      // Find a free table
      const freeTable = TABLES.find((t) => tableTracker[t] <= createdAt.getTime())
        || TABLES[Math.floor(Math.random() * TABLES.length)]

      const diningMins = 50 + Math.random() * 30  // 50–80 min
      tableTracker[freeTable] = createdAt.getTime() + diningMins * 60000

      const servedAt = new Date(createdAt.getTime() + diningMins * 60000)
      const items = pickItems()
      const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0)

      orders.push({
        table_id: freeTable,
        channel: 'dine_in',
        status: 'served',
        items,
        total_amount: total,
        created_at: createdAt,
        served_at: servedAt,
        payment_method: pickPayment(),
      })
    }

    // ── Dinner dine-in orders ──
    const dinnerTracker = makeTableTracker()  // Reset table availability for dinner session
    for (let i = 0; i < dinnerDineIn; i++) {
      const offsetMin = jitter(DINNER_SLOTS[Math.floor(Math.random() * DINNER_SLOTS.length)])
      const createdAt = new Date(dinnerBase.getTime() + offsetMin * 60000)

      const freeTable = TABLES.find((t) => dinnerTracker[t] <= createdAt.getTime())
        || TABLES[Math.floor(Math.random() * TABLES.length)]

      const diningMins = 50 + Math.random() * 30
      dinnerTracker[freeTable] = createdAt.getTime() + diningMins * 60000

      const servedAt = new Date(createdAt.getTime() + diningMins * 60000)
      const items = pickItems()
      const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0)

      orders.push({
        table_id: freeTable,
        channel: 'dine_in',
        status: 'served',
        items,
        total_amount: total,
        created_at: createdAt,
        served_at: servedAt,
        payment_method: pickPayment(),
      })
    }

    // ── Takeaway orders (own delivery, spread across both sessions) ──
    const lunchTakeaway  = Math.round(dailyTakeaway * 5 / 13)
    const dinnerTakeaway = dailyTakeaway - lunchTakeaway

    for (let i = 0; i < lunchTakeaway; i++) {
      const offsetMin = jitter(LUNCH_SLOTS[Math.floor(Math.random() * LUNCH_SLOTS.length)])
      const createdAt = new Date(lunchBase.getTime() + offsetMin * 60000)
      const servedAt  = new Date(createdAt.getTime() + (25 + Math.random() * 15) * 60000)
      const items = pickItems()
      const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0)
      orders.push({
        table_id: null,
        channel: 'takeaway',
        status: 'served',
        items,
        total_amount: total,
        created_at: createdAt,
        served_at: servedAt,
        payment_method: pickPayment(),
      })
    }

    for (let i = 0; i < dinnerTakeaway; i++) {
      const offsetMin = jitter(DINNER_SLOTS[Math.floor(Math.random() * DINNER_SLOTS.length)])
      const createdAt = new Date(dinnerBase.getTime() + offsetMin * 60000)
      const servedAt  = new Date(createdAt.getTime() + (25 + Math.random() * 15) * 60000)
      const items = pickItems()
      const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0)
      orders.push({
        table_id: null,
        channel: 'takeaway',
        status: 'served',
        items,
        total_amount: total,
        created_at: createdAt,
        served_at: servedAt,
        payment_method: pickPayment(),
      })
    }

    // ── Reservations (~20% of lunch dine-in + 25% of dinner dine-in) ──
    const lunchRes  = Math.round(lunchDineIn  * 0.20)
    const dinnerRes = Math.round(dinnerDineIn * 0.25)

    const guestNames = [
      'Nguyễn Thị Lan','Trần Văn Hùng','Lê Thị Mai','Phạm Văn Nam','Hoàng Thị Hoa',
      'Đặng Văn Bình','Vũ Thị Thu','Bùi Văn Đức','Đỗ Thị Hương','Ngô Văn Long',
      'Phan Thị Nga','Đinh Văn Tâm','Lý Thị Kim','Trương Văn Minh','Cao Thị Yến',
    ]

    for (let i = 0; i < lunchRes + dinnerRes; i++) {
      const isLunch = i < lunchRes
      const base = isLunch ? lunchBase : dinnerBase
      const offsetMin = isLunch
        ? 30 + Math.random() * 90   // 11:30–13:00
        : 30 + Math.random() * 150  // 18:30–21:00
      const resTime = new Date(base.getTime() + offsetMin * 60000)
      const isConfirmed = Math.random() > 0.1  // 90% confirmed
      reservations.push({
        guest_name: guestNames[Math.floor(Math.random() * guestNames.length)],
        party_size: 2 + Math.floor(Math.random() * 4),
        reservation_time: resTime,
        status: isConfirmed ? 'confirmed' : 'cancelled',
        channel: 'phone',
        created_at: new Date(resTime.getTime() - (1 + Math.random() * 5) * 24 * 3600000),
      })
    }
  }

  // Sort all orders by created_at
  orders.sort((a, b) => a.created_at - b.created_at)
  console.log(`\n  Generated ${orders.length} orders and ${reservations.length} reservations`)
  return { orders, reservations }
}

async function batchWrite(collectionName, docs, label) {
  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const docData of chunk) {
      const ref = db.collection(collectionName).doc()
      batch.set(ref, docData)
    }
    await batch.commit()
    written += chunk.length
    process.stdout.write(`\r  ${label}: ${written}/${docs.length} written...`)
  }
  console.log(`\r  ✓ ${label}: ${docs.length} documents written          `)
}

async function main() {
  console.log('🍽  Generating June 2026 restaurant data...\n')
  const { orders, reservations } = await generateOrders()

  const stats = {
    dineIn:   orders.filter((o) => o.channel === 'dine_in').length,
    takeaway: orders.filter((o) => o.channel === 'takeaway').length,
    totalRevenue: orders.reduce((s, o) => s + o.total_amount, 0),
  }
  console.log(`\n  Breakdown:`)
  console.log(`    Dine-in orders  : ${stats.dineIn}`)
  console.log(`    Takeaway orders : ${stats.takeaway}`)
  console.log(`    Total revenue   : ${(stats.totalRevenue / 1e6).toFixed(1)}M VND`)
  console.log(`    Avg per day     : ${(stats.totalRevenue / 30 / 1e6).toFixed(2)}M VND`)
  console.log()

  await batchWrite('orders', orders, 'orders')
  await batchWrite('reservations', reservations, 'reservations')

  console.log('\n✅ Data generation complete.')
  console.log('   Next: run computeHistoricalBaseline.js to update the analytics baseline.')
}

main().catch((err) => { console.error(err); process.exit(1) })
