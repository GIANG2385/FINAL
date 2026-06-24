/**
 * resetJuneData.js
 * Deletes all documents from: orders, kitchen_queue, insights, reservations
 * Resets tables T01-T08 to status 'open'
 * Deletes analytics/historical_baseline
 *
 * Run: node backend/src/scripts/resetJuneData.js
 */
import 'dotenv/config'
import { db } from '../firebaseAdmin.js'

const BATCH_SIZE = 400

async function deleteCollection(collectionName) {
  let deleted = 0
  while (true) {
    const snap = await db.collection(collectionName).limit(BATCH_SIZE).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += snap.docs.length
    process.stdout.write(`\r  ${collectionName}: deleted ${deleted} docs...`)
  }
  console.log(`\r  ✓ ${collectionName}: ${deleted} docs deleted          `)
}

async function resetTables() {
  const tables = ['T01','T02','T03','T04','T05','T06','T07','T08']
  const capacities = { T01:4, T02:2, T03:6, T04:2, T05:4, T06:6, T07:2, T08:4 }
  const batch = db.batch()
  for (const id of tables) {
    const ref = db.collection('tables').doc(id)
    batch.set(ref, {
      table_id: id,
      status: 'open',
      capacity: capacities[id],
      seated_at: null,
    })
  }
  await batch.commit()
  console.log('  ✓ tables: 8 tables reset to open')
}

async function deleteHistoricalBaseline() {
  try {
    await db.collection('analytics').doc('historical_baseline').delete()
    console.log('  ✓ analytics/historical_baseline: deleted')
  } catch {
    console.log('  ✓ analytics/historical_baseline: not found (skipped)')
  }
}

async function main() {
  console.log('🗑  Resetting Firestore data...\n')
  await deleteCollection('orders')
  await deleteCollection('kitchen_queue')
  await deleteCollection('insights')
  await deleteCollection('reservations')
  await deleteHistoricalBaseline()
  await resetTables()
  console.log('\n✅ Reset complete. Ready to generate fresh data.')
}

main().catch((err) => { console.error(err); process.exit(1) })
