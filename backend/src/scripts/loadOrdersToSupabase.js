// Migrates pangpang_june_orders.json (2000 orders) into the Supabase `orders` table.
// Run once: node src/scripts/loadOrdersToSupabase.js
import 'dotenv/config'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const filePath = resolve(__dirname, '../../../pangpang_june_orders.json')
const orders = JSON.parse(readFileSync(filePath, 'utf8'))
console.log(`Loaded ${orders.length} orders from JSON`)

// Supabase upsert in batches of 200
const BATCH = 200
let inserted = 0

for (let i = 0; i < orders.length; i += BATCH) {
  const batch = orders.slice(i, i + BATCH).map((o) => ({
    id:             o.id,
    channel:        o.channel,
    table_id:       o.table_id,
    items:          o.items,
    status:         o.status,
    created_at:     o.created_at,
    served_at:      o.served_at,
    total_amount:   o.total_amount,
    payment_method: o.payment_method,
  }))

  const { error } = await supabase.from('orders').upsert(batch, { onConflict: 'id' })
  if (error) {
    console.error(`Batch ${i / BATCH + 1} failed:`, error.message)
    process.exit(1)
  }
  inserted += batch.length
  console.log(`Inserted ${inserted}/${orders.length}`)
}

console.log('Migration complete.')
