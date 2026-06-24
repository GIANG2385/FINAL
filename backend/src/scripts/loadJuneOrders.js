// Loads pangpang_june_orders.json into Firestore.
// Run: node src/scripts/loadJuneOrders.js
import 'dotenv/config'
import { readFileSync } from 'fs'
import { db } from '../firebaseAdmin.js'

const orders = JSON.parse(
  readFileSync(new URL('../../../pangpang_june_orders.json', import.meta.url))
)

const BATCH_SIZE = 500
let written = 0

for (let i = 0; i < orders.length; i += BATCH_SIZE) {
  const chunk = orders.slice(i, i + BATCH_SIZE)
  const batch = db.batch()
  chunk.forEach((order) => {
    const ref = db.collection('orders').doc(order.id)
    batch.set(ref, {
      ...order,
      created_at: new Date(order.created_at),
      served_at:  order.served_at ? new Date(order.served_at) : null,
    })
  })
  await batch.commit()
  written += chunk.length
  console.log(`Loaded ${written}/${orders.length}`)
}

console.log('June order load complete.')
process.exit(0)
