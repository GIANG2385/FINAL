// One-off script: set realistic unit_cost (VND) on inventory items by SKU.
// Run with: node src/scripts/setInventoryCosts.js
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

const UNIT_COSTS = {
  'TH-CHK-01':   90000,   // Chicken Thigh — 90,000 VND/kg
  'TH-BEEF-01':  220000,  // Beef Sirloin  — 220,000 VND/kg
  'TH-SHRIMP-01':180000,  // Shrimp        — 180,000 VND/kg
  'TH-RICE-01':  22000,   // Jasmine Rice  — 22,000 VND/kg
  'TH-BASIL-01': 40000,   // Thai Basil    — 40,000 VND/kg
  'TH-COCO-01':  35000,   // Coconut Milk  — 35,000 VND/L
}

async function run() {
  const snap = await db.collection('inventory').get()
  const batch = db.batch()
  let count = 0
  snap.docs.forEach((d) => {
    const sku = d.data().sku
    if (UNIT_COSTS[sku] !== undefined) {
      batch.update(d.ref, { unit_cost: UNIT_COSTS[sku] })
      count++
      console.log(`  ${sku} → ${UNIT_COSTS[sku].toLocaleString()} VND`)
    }
  })
  await batch.commit()
  console.log(`\nUpdated ${count} inventory items.`)
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
