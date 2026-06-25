// src/controllers/ordersController.js
import { supabase } from '../supabaseClient.js'
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

  // Decrement inventory (sequential, no transaction)
  for (const item of resolvedItems) {
    const { data: inv, error: invErr } = await supabase
      .from('inventory')
      .select('current_stock')
      .eq('sku', item.ingredient_sku)
      .single()
    if (invErr && invErr.code !== 'PGRST116') {
      return res.status(500).json({ error: invErr.message })
    }
    if (inv) {
      const next = Math.max(0, inv.current_stock - item.ingredient_qty * item.qty)
      const { error: updErr } = await supabase
        .from('inventory')
        .update({ current_stock: next })
        .eq('sku', item.ingredient_sku)
      if (updErr) return res.status(500).json({ error: updErr.message })
    }
  }

  // Insert order
  const orderId = crypto.randomUUID()
  const orderRow = {
    id: orderId,
    channel: channel || 'dine_in',
    items: resolvedItems.map(({ sku, name_en, name_vi, qty, unit_price }) => ({
      sku, name_en, name_vi, qty, unit_price,
    })),
    table_id,
    status: 'open',
    created_at: new Date().toISOString(),
    served_at: null,
    total_amount,
    payment_method: null,
  }
  const { data: created, error: orderErr } = await supabase
    .from('orders')
    .insert(orderRow)
    .select()
    .single()
  if (orderErr) return res.status(500).json({ error: orderErr.message })

  // Update table status
  const { error: tableErr } = await supabase
    .from('tables')
    .update({ status: 'dining', seated_at: new Date().toISOString() })
    .eq('table_id', table_id)
  if (tableErr) console.error('table update failed:', tableErr.message)

  res.status(201).json(created)
}

export async function updateOrderStatus(req, res) {
  const { id } = req.params
  const { status } = req.body
  const validStatuses = ['open', 'in_kitchen', 'served', 'cancelled']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` })
  }

  // Fetch existing order
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr) return res.status(404).json({ error: 'Order not found' })

  const update = { status }
  if (status === 'served') update.served_at = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return res.status(500).json({ error: updateErr.message })

  // Insert kitchen queue rows when status transitions to in_kitchen
  if (status === 'in_kitchen') {
    const queueRows = (order.items || []).map((item) => ({
      queue_id: crypto.randomUUID(),
      order_id: id,
      item_sku: item.sku,
      station: 'kitchen',
      status: 'queued',
      queued_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      prep_time_target_min: 15,
    }))
    if (queueRows.length > 0) {
      const { error: qErr } = await supabase.from('kitchen_queue').insert(queueRows)
      if (qErr) console.error('kitchen_queue insert failed:', qErr.message)
    }
  }

  res.json(updated)
}
