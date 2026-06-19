import { db } from '../firebaseAdmin.js'
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
  const orderRef = db.collection('orders').doc()

  await db.runTransaction(async (tx) => {
    for (const item of resolvedItems) {
      const invRef = db.collection('inventory').doc(item.ingredient_sku)
      const invSnap = await tx.get(invRef)
      if (invSnap.exists) {
        const current = invSnap.data().current_stock ?? 0
        const next = Math.max(0, current - item.ingredient_qty * item.qty)
        tx.update(invRef, { current_stock: next })
      }
    }

    tx.set(orderRef, {
      channel: channel || 'dine_in',
      items: resolvedItems.map(({ sku, name_en, name_vi, qty, unit_price }) => ({ sku, name_en, name_vi, qty, unit_price })),
      table_id,
      status: 'open',
      created_at: new Date(),
      served_at: null,
      total_amount,
      payment_method: null,
    })

    tx.update(db.collection('tables').doc(table_id), { status: 'dining', seated_at: new Date() })
  })

  const created = await orderRef.get()
  res.status(201).json({ id: orderRef.id, ...created.data() })
}

export async function updateOrderStatus(req, res) {
  const { id } = req.params
  const { status } = req.body
  const validStatuses = ['open', 'in_kitchen', 'served', 'cancelled']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` })
  }

  const orderRef = db.collection('orders').doc(id)
  const orderSnap = await orderRef.get()
  if (!orderSnap.exists) {
    return res.status(404).json({ error: 'Order not found' })
  }
  const order = orderSnap.data()

  const update = { status }
  if (status === 'served') update.served_at = new Date()

  await orderRef.update(update)

  if (status === 'in_kitchen') {
    const batch = db.batch()
    for (const item of order.items) {
      const queueRef = db.collection('kitchen_queue').doc()
      batch.set(queueRef, {
        order_id: id,
        item_sku: item.sku,
        station: 'kitchen',
        status: 'queued',
        queued_at: new Date(),
        started_at: null,
        completed_at: null,
        prep_time_target_min: 15,
      })
    }
    await batch.commit()
  }

  const updated = await orderRef.get()
  res.json({ id, ...updated.data() })
}
