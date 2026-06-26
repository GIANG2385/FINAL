import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import supabase from '../services/supabase'
import { MENU_ITEMS } from '../data/menu'

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

function formatVnd(amount, lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency', currency: 'VND',
  }).format(amount)
}

function formatTime(date, lang) {
  return date.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

const tabBtn = (active) => ({
  padding: '10px 20px',
  border: 'none',
  borderBottom: active ? '2px solid var(--pp-primary)' : '2px solid transparent',
  background: 'transparent',
  color: active ? 'var(--pp-primary)' : 'var(--pp-text-muted)',
  fontWeight: active ? 700 : 400,
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'all 0.15s',
})

const card = {
  background: 'var(--pp-card-bg)',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  padding: '18px 20px',
}

const STATIC_SUPPLIERS = [
  { id: 1, name: 'Chị Lan — Chợ Hôm', items: 'Thịt bò, Xương heo', lastDelivery: '2026-06-24', reliability: 95 },
  { id: 2, name: 'Anh Tuấn — Chợ Đồng Xuân', items: 'Rau, Hành lá, Gia vị', lastDelivery: '2026-06-23', reliability: 82 },
  { id: 3, name: 'Cty Minh Tâm', items: 'Bánh phở, Bún', lastDelivery: '2026-06-22', reliability: 68 },
]

const STATIC_CHANNELS = [
  { name_vi: 'Tại bàn', name_en: 'Dine-in', orders: 48, revenue: 6240000 },
  { name_vi: 'Mang về', name_en: 'Takeaway', orders: 15, revenue: 1350000 },
  { name_vi: 'GrabFood', name_en: 'GrabFood', orders: 22, revenue: 2090000 },
  { name_vi: 'ShopeeFood', name_en: 'ShopeeFood', orders: 9, revenue: 855000 },
]

const FOOD_COST_PCT = 0.32
const HOURLY_WAGE_VND = 25000

export default function BackOfHouse() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('inventory')
  const [staffShifts, setStaffShifts] = useState(null)
  const [orders, setOrders] = useState(null)
  const [allOrders, setAllOrders] = useState(null)
  const [inventoryRaw, setInventoryRaw] = useState(null)
  const [localStock, setLocalStock] = useState({})
  const [localUnitCost, setLocalUnitCost] = useState({})
  const [menuItems, setMenuItems] = useState(null)
  const [showAddDish, setShowAddDish] = useState(false)
  const [newDish, setNewDish] = useState({ name_en: '', name_vi: '', unit_price: '' })
  const [addIngredientTo, setAddIngredientTo] = useState(null)
  const [newIngredient, setNewIngredient] = useState({ ingredient_sku: '', qty: '' })
  const [recipeError, setRecipeError] = useState(null)
  const [editingIngredient, setEditingIngredient] = useState(null) // { dishId, ingredient_sku }
  const [editValues, setEditValues] = useState({ qty: '', cost_per_unit: '' })
  const [showAddInventory, setShowAddInventory] = useState(false)
  const [newInvItem, setNewInvItem] = useState({ name_en: '', name_vi: '', unit: '', current_stock: '', par_level: '' })
  const [invError, setInvError] = useState(null)
  const [editingInvSku, setEditingInvSku] = useState(null)
  const [editInvValues, setEditInvValues] = useState({ name_en: '', name_vi: '', unit: '', par_level: '' })
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: '', role: '', shift_start: '', shift_end: '' })
  const [staffError, setStaffError] = useState(null)
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editStaffValues, setEditStaffValues] = useState({ name: '', role: '', shift_start: '', shift_end: '' })
  const seededRef = useRef(false)
  const costSeededRef = useRef(false)

  const UNIT_COSTS = {
    'INV-CHK-01':    90000,
    'INV-BEEF-01':  220000,
    'INV-SHRIMP-01':180000,
    'INV-RICE-01':   22000,
    'INV-BASIL-01':  40000,
    'INV-COCO-01':   35000,
    'INV-MANGO-01':  50000,
    'INV-NOODLE-01': 18000,
  }

  useEffect(() => {
    // ── staff_shifts ──
    supabase.from('staff_shifts').select('*').then(({ data }) => {
      setStaffShifts(data || [])
    })
    const shiftsChannel = supabase.channel('staff-shifts-boh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shifts' }, () => {
        supabase.from('staff_shifts').select('*').then(({ data }) => setStaffShifts(data || []))
      })
      .subscribe()

    // ── orders (today) ──
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999)
    const startOfToday = dayStart.toISOString()
    const endOfToday = dayEnd.toISOString()

    supabase.from('orders').select('*').gte('created_at', startOfToday).lt('created_at', endOfToday).then(({ data }) => {
      setOrders(data || [])
    })
    const ordersChannel = supabase.channel('orders-boh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase.from('orders').select('*').gte('created_at', startOfToday).lt('created_at', endOfToday).then(({ data }) => setOrders(data || []))
      })
      .subscribe()

    // ── orders (30 days) for export ──
    const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30); monthStart.setHours(0, 0, 0, 0)
    supabase.from('orders').select('*').gte('created_at', monthStart.toISOString()).order('created_at', { ascending: false }).then(({ data }) => {
      setAllOrders(data || [])
    })

    // ── inventory ──
    supabase.from('inventory').select('*').then(async ({ data }) => {
      const items = data || []
      setInventoryRaw(items)
      // Auto-seed cost_per_unit if none of the items have it yet
      if (!costSeededRef.current && items.length > 0 && items.every((i) => i.cost_per_unit == null)) {
        costSeededRef.current = true
        for (const item of items) {
          if (UNIT_COSTS[item.sku] != null) {
            await supabase.from('inventory').update({ cost_per_unit: UNIT_COSTS[item.sku] }).eq('sku', item.sku).catch(console.error)
          }
        }
      }
    })
    const invChannel = supabase.channel('inventory-boh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        supabase.from('inventory').select('*').then(({ data }) => setInventoryRaw(data || []))
      })
      .subscribe()

    // ── menu_items ──
    supabase.from('menu_items').select('*').then(async ({ data }) => {
      const items = data || []
      setMenuItems(items)
      // Auto-seed from hardcoded MENU_ITEMS if collection is empty
      if (items.length === 0 && !seededRef.current) {
        seededRef.current = true
        for (const m of MENU_ITEMS) {
          await supabase.from('menu_items').insert({
            sku: m.sku, name_en: m.name_en, name_vi: m.name_vi,
            unit_price: m.unit_price, recipes: m.recipes || [],
          }).catch(console.error)
        }
        // Refresh after seeding
        supabase.from('menu_items').select('*').then(({ data: seeded }) => setMenuItems(seeded || []))
      }
    })
    const menuChannel = supabase.channel('menu-items-boh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        supabase.from('menu_items').select('*').then(({ data }) => setMenuItems(data || []))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(shiftsChannel)
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(invChannel)
      supabase.removeChannel(menuChannel)
    }
  }, [])

  // Compute profit from Supabase data (same logic as backend profitController)
  const profit = useMemo(() => {
    if (!orders || !staffShifts) return null
    const revenue = orders.filter((o) => o.status === 'served').reduce((s, o) => s + (o.total_amount || 0), 0)
    const labor_cost = Math.round(staffShifts.reduce((s, sh) => {
      const start = toDate(sh.shift_start); const end = toDate(sh.shift_end)
      if (!start || !end) return s
      return s + Math.max(0, (end - start) / 3600000) * HOURLY_WAGE_VND
    }, 0))
    const food_cost = Math.round(revenue * FOOD_COST_PCT)
    return { revenue, food_cost, labor_cost, profit: revenue - food_cost - labor_cost }
  }, [orders, staffShifts])

  // Compute stockout forecast from Supabase data (same logic as backend inventoryController)
  const inventory = useMemo(() => {
    if (!inventoryRaw) return null
    const now = Date.now()
    return inventoryRaw.map((item) => {
      const hourly = (item.avg_daily_consumption || 0) / 24
      const hoursLeft = hourly > 0 ? item.current_stock / hourly : null
      return {
        ...item,
        hours_remaining: hoursLeft !== null ? Math.round(hoursLeft * 10) / 10 : null,
        stockout_at: hoursLeft !== null ? new Date(now + hoursLeft * 3600000) : null,
        at_risk: hoursLeft !== null && hoursLeft <= 6,
      }
    }).sort((a, b) => (a.hours_remaining ?? Infinity) - (b.hours_remaining ?? Infinity))
  }, [inventoryRaw])

  const getStock = (item) => localStock[item.sku] !== undefined ? localStock[item.sku] : (item.current_stock ?? 0)

  function updateStock(sku, newVal) {
    const val = Math.max(0, parseFloat(newVal.toFixed(1)))
    setLocalStock((prev) => ({ ...prev, [sku]: val }))
  }

  async function saveStock(item) {
    const updates = { current_stock: getStock(item) }
    if (localUnitCost[item.sku] !== undefined) updates.cost_per_unit = localUnitCost[item.sku]
    try {
      await supabase.from('inventory').update(updates).eq('sku', item.sku)
      setLocalStock((prev) => { const next = { ...prev }; delete next[item.sku]; return next })
      setLocalUnitCost((prev) => { const next = { ...prev }; delete next[item.sku]; return next })
    } catch (e) { console.error(e) }
  }

  const invMap = useMemo(() => {
    const map = {}
    for (const inv of (inventoryRaw || [])) map[inv.sku] = inv
    return map
  }, [inventoryRaw])

  async function handleAddDish() {
    const name_en = newDish.name_en.trim()
    const name_vi = newDish.name_vi.trim()
    const unit_price = Number(newDish.unit_price)
    if (!name_en || !name_vi || !unit_price) { setRecipeError('All fields required'); return }
    try {
      await supabase.from('menu_items').insert({
        sku: `M-${name_en.toUpperCase().replace(/\s+/g, '-').slice(0, 20)}-${Date.now().toString(36).slice(-4)}`,
        name_en, name_vi, unit_price, recipes: [],
      })
      setNewDish({ name_en: '', name_vi: '', unit_price: '' })
      setShowAddDish(false)
      setRecipeError(null)
    } catch (e) { console.error(e); setRecipeError(e.message || 'Error saving') }
  }

  async function handleDeleteDish(dishId) {
    if (!window.confirm(i18n.language === 'vi' ? 'Xoá món này?' : 'Delete this dish?')) return
    try { await supabase.from('menu_items').delete().eq('sku', dishId) } catch (e) { console.error(e) }
  }

  async function handleAddIngredient(dish) {
    const sku = newIngredient.ingredient_sku
    const qty = parseFloat(newIngredient.qty)
    if (!sku || !qty || qty <= 0) { setRecipeError('Select an ingredient and enter quantity'); return }
    const exists = (dish.recipes || []).some((r) => r.ingredient_sku === sku)
    if (exists) { setRecipeError('Ingredient already in recipe'); return }
    const inv = invMap[sku]
    const updated = [...(dish.recipes || []), { ingredient_sku: sku, ingredient_name_en: inv?.name_en || sku, ingredient_name_vi: inv?.name_vi || sku, qty, unit: inv?.unit || '' }]
    try {
      await supabase.from('menu_items').update({ recipes: updated }).eq('sku', dish.sku)
      setNewIngredient({ ingredient_sku: '', qty: '' })
      setAddIngredientTo(null)
      setRecipeError(null)
    } catch (e) { console.error(e); setRecipeError(e.message || 'Error saving') }
  }

  async function handleDeleteIngredient(dish, ingredientSku) {
    const updated = (dish.recipes || []).filter((r) => r.ingredient_sku !== ingredientSku)
    try { await supabase.from('menu_items').update({ recipes: updated }).eq('sku', dish.sku) } catch (e) { console.error(e) }
  }

  function startEditIngredient(dish, r) {
    const inv = invMap[r.ingredient_sku]
    setEditingIngredient({ dishId: dish.sku, ingredient_sku: r.ingredient_sku })
    setEditValues({ qty: String(r.qty), cost_per_unit: String(inv?.cost_per_unit ?? '') })
    setRecipeError(null)
  }

  async function handleSaveIngredientEdit(dish) {
    const qty = parseFloat(editValues.qty)
    const cost_per_unit = editValues.cost_per_unit !== '' ? parseFloat(editValues.cost_per_unit) : null
    if (!qty || qty <= 0) { setRecipeError('Qty must be > 0'); return }
    try {
      // Update recipe qty on the dish
      const updated = (dish.recipes || []).map((r) =>
        r.ingredient_sku === editingIngredient.ingredient_sku ? { ...r, qty } : r
      )
      await supabase.from('menu_items').update({ recipes: updated }).eq('sku', dish.sku)

      // Update cost_per_unit on the inventory item if provided
      if (cost_per_unit !== null) {
        const inv = invMap[editingIngredient.ingredient_sku]
        if (inv?.sku) await supabase.from('inventory').update({ cost_per_unit: cost_per_unit }).eq('sku', inv.sku)
      }

      setEditingIngredient(null)
      setEditValues({ qty: '', cost_per_unit: '' })
      setRecipeError(null)
    } catch (e) { console.error(e); setRecipeError(e.message || 'Error saving') }
  }

  async function handleUpdateDishPrice(dish, newPrice) {
    const price = Number(newPrice)
    if (!price || price <= 0) return
    try { await supabase.from('menu_items').update({ unit_price: price }).eq('sku', dish.sku) } catch (e) { console.error(e) }
  }

  async function handleAddInventoryItem() {
    const name_en = newInvItem.name_en.trim()
    const name_vi = newInvItem.name_vi.trim()
    const unit = newInvItem.unit.trim()
    const current_stock = parseFloat(newInvItem.current_stock)
    const par_level = parseFloat(newInvItem.par_level)
    if (!name_en || !name_vi || !unit || isNaN(current_stock) || isNaN(par_level)) {
      setInvError(i18n.language === 'vi' ? 'Vui lòng điền đầy đủ thông tin' : 'All fields are required')
      return
    }
    const sku = `INV-${name_en.toUpperCase().replace(/\s+/g, '-').slice(0, 12)}-${Date.now().toString(36).slice(-4)}`
    try {
      await supabase.from('inventory').insert({ sku, name_en, name_vi, unit, current_stock, par_level, avg_daily_consumption: 0 })
      setNewInvItem({ name_en: '', name_vi: '', unit: '', current_stock: '', par_level: '' })
      setShowAddInventory(false)
      setInvError(null)
    } catch (e) { console.error(e); setInvError(e.message || 'Error saving') }
  }

  async function handleDeleteInventoryItem(sku) {
    const msg = i18n.language === 'vi' ? 'Xoá nguyên liệu này?' : 'Delete this ingredient?'
    if (!window.confirm(msg)) return
    try { await supabase.from('inventory').delete().eq('sku', sku) } catch (e) { console.error(e) }
  }

  async function handleSaveInvEdit(sku) {
    const name_en = editInvValues.name_en.trim()
    const name_vi = editInvValues.name_vi.trim()
    const unit = editInvValues.unit.trim()
    const par_level = parseFloat(editInvValues.par_level)
    if (!name_en || !name_vi || !unit || isNaN(par_level)) {
      setInvError(i18n.language === 'vi' ? 'Vui lòng điền đầy đủ thông tin' : 'All fields are required')
      return
    }
    try {
      await supabase.from('inventory').update({ name_en, name_vi, unit, par_level }).eq('sku', sku)
      setEditingInvSku(null)
      setInvError(null)
    } catch (e) { console.error(e); setInvError(e.message || 'Error saving') }
  }

  async function handleAddStaff() {
    const name = newStaff.name.trim()
    const role = newStaff.role.trim()
    if (!name || !role || !newStaff.shift_start || !newStaff.shift_end) {
      setStaffError(i18n.language === 'vi' ? 'Vui lòng điền đầy đủ thông tin' : 'All fields are required')
      return
    }
    try {
      await supabase.from('staff_shifts').insert({
        name, role,
        shift_start: new Date(newStaff.shift_start).toISOString(),
        shift_end: new Date(newStaff.shift_end).toISOString(),
      })
      setNewStaff({ name: '', role: '', shift_start: '', shift_end: '' })
      setShowAddStaff(false)
      setStaffError(null)
    } catch (e) { console.error(e); setStaffError(e.message || 'Error saving') }
  }

  async function handleDeleteStaff(staffId) {
    const msg = i18n.language === 'vi' ? 'Xoá ca làm này?' : 'Delete this shift?'
    if (!window.confirm(msg)) return
    try { await supabase.from('staff_shifts').delete().eq('staff_id', staffId) } catch (e) { console.error(e) }
  }

  async function handleSaveStaffEdit(staffId) {
    const name = editStaffValues.name.trim()
    const role = editStaffValues.role.trim()
    if (!name || !role || !editStaffValues.shift_start || !editStaffValues.shift_end) {
      setStaffError(i18n.language === 'vi' ? 'Vui lòng điền đầy đủ thông tin' : 'All fields are required')
      return
    }
    try {
      await supabase.from('staff_shifts').update({
        name, role,
        shift_start: new Date(editStaffValues.shift_start).toISOString(),
        shift_end: new Date(editStaffValues.shift_end).toISOString(),
      }).eq('staff_id', staffId)
      setEditingStaffId(null)
      setStaffError(null)
    } catch (e) { console.error(e); setStaffError(e.message || 'Error saving') }
  }

  const now = new Date()
  const onShiftNow = (staffShifts || []).filter((s) => {
    const start = toDate(s.shift_start); const end = toDate(s.shift_end)
    return start && end && start <= now && now <= end
  })
  const recentOrderVolume = (orders || []).filter((o) => {
    const created = toDate(o.created_at)
    return created && Date.now() - created.getTime() < 2 * 60 * 60 * 1000
  }).length
  const staffingFlag = recentOrderVolume > onShiftNow.length * 5 ? 'understaffed'
    : onShiftNow.length > 0 && recentOrderVolume < onShiftNow.length ? 'overstaffed' : 'ok'

  const tabs = [
    { id: 'inventory', label: i18n.language === 'vi' ? 'Tồn kho' : 'Inventory' },
    { id: 'recipes',   label: i18n.language === 'vi' ? 'Công thức' : 'Recipes' },
    { id: 'labor',     label: i18n.language === 'vi' ? 'Nhân sự' : 'Labor' },
    { id: 'supply',    label: i18n.language === 'vi' ? 'Cung ứng & Doanh thu' : 'Supply & Revenue' },
  ]

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Stock Control</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>{i18n.language === 'vi' ? 'Tồn kho · công thức · nhân sự · cung ứng' : 'Inventory · recipes · labor · supply chain'}</p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--pp-border)', marginBottom: '24px' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={tabBtn(activeTab === tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab A: Inventory ── */}
      {activeTab === 'inventory' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{t('boh.inventory')}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  const rows = (inventory || []).slice(0, 10)
                  const headers = ['SKU', 'Name EN', 'Name VI', 'Unit', 'Stock', 'Par Level', 'Cost/unit', 'Hours Remaining']
                  const csv = [headers, ...rows.map((r) => [r.sku, r.name_en, r.name_vi, r.unit, r.current_stock, r.par_level, r.cost_per_unit ?? '', r.hours_remaining ?? ''])].map((row) => row.join(',')).join('\n')
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                  a.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`
                  a.click()
                }}
                style={{ background: 'white', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}
              </button>
              <button
                onClick={() => { setShowAddInventory(true); setInvError(null) }}
                style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                + {i18n.language === 'vi' ? 'Thêm nguyên liệu' : 'Add Ingredient'}
              </button>
            </div>
          </div>

          {invError && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '10px' }}>{invError}</p>}

          {showAddInventory && (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 12px' }}>
                {i18n.language === 'vi' ? 'Nguyên liệu mới' : 'New Ingredient'}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input placeholder="Name (EN)" value={newInvItem.name_en}
                  onChange={(e) => setNewInvItem((d) => ({ ...d, name_en: e.target.value }))}
                  style={{ flex: 1, minWidth: '120px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <input placeholder="Tên (VI)" value={newInvItem.name_vi}
                  onChange={(e) => setNewInvItem((d) => ({ ...d, name_vi: e.target.value }))}
                  style={{ flex: 1, minWidth: '120px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <input placeholder={i18n.language === 'vi' ? 'Đơn vị (kg, L…)' : 'Unit (kg, L…)'} value={newInvItem.unit}
                  onChange={(e) => setNewInvItem((d) => ({ ...d, unit: e.target.value }))}
                  style={{ width: '100px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <input type="number" min="0" placeholder={i18n.language === 'vi' ? 'Tồn kho' : 'Stock'} value={newInvItem.current_stock}
                  onChange={(e) => setNewInvItem((d) => ({ ...d, current_stock: e.target.value }))}
                  style={{ width: '90px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <input type="number" min="0" placeholder={i18n.language === 'vi' ? 'Mức chuẩn' : 'Par level'} value={newInvItem.par_level}
                  onChange={(e) => setNewInvItem((d) => ({ ...d, par_level: e.target.value }))}
                  style={{ width: '100px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddInventoryItem} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Thêm' : 'Add'}
                </button>
                <button onClick={() => { setShowAddInventory(false); setInvError(null) }} style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Huỷ' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {inventory === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.item'), t('boh.stock'), t('boh.par'), t('boh.stockoutProjection'), i18n.language === 'vi' ? 'Giá/đơn vị' : 'Cost/unit', i18n.language === 'vi' ? 'Cập nhật' : 'Update', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.slice(0, 10).map((item) => {
                    const stock = getStock(item)
                    const parLevel = item.par_level
                    const rowStatus = stock <= 0 ? 'critical' : stock < parLevel * 0.3 ? 'critical' : stock < parLevel * 0.6 ? 'warning' : 'ok'
                    const isEditingRow = editingInvSku === item.sku
                    if (isEditingRow) {
                      return (
                        <tr key={item.sku} style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-info-bg)' }}>
                          <td style={{ padding: '8px 12px' }} colSpan={3}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <input value={editInvValues.name_en} onChange={(e) => setEditInvValues((v) => ({ ...v, name_en: e.target.value }))}
                                placeholder="Name EN" style={{ flex: 1, minWidth: '100px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                              <input value={editInvValues.name_vi} onChange={(e) => setEditInvValues((v) => ({ ...v, name_vi: e.target.value }))}
                                placeholder="Tên VI" style={{ flex: 1, minWidth: '100px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                              <input value={editInvValues.unit} onChange={(e) => setEditInvValues((v) => ({ ...v, unit: e.target.value }))}
                                placeholder={i18n.language === 'vi' ? 'Đơn vị' : 'Unit'} style={{ width: '70px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                              <input type="number" min="0" value={editInvValues.par_level} onChange={(e) => setEditInvValues((v) => ({ ...v, par_level: e.target.value }))}
                                placeholder={i18n.language === 'vi' ? 'Mức chuẩn' : 'Par'} style={{ width: '80px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px' }}>—</td>
                          <td style={{ padding: '8px 12px' }}>—</td>
                          <td style={{ padding: '8px 12px' }}>—</td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => handleSaveInvEdit(item.sku)} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                {i18n.language === 'vi' ? 'Lưu' : 'Save'}
                              </button>
                              <button onClick={() => { setEditingInvSku(null); setInvError(null) }} style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={item.sku} style={{
                        borderBottom: '1px solid var(--pp-border)',
                        background: rowStatus === 'critical' ? 'var(--pp-danger-bg)' : rowStatus === 'warning' ? 'var(--pp-warning-bg)' : 'transparent',
                      }}>
                        <td style={{ padding: '12px' }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</td>
                        <td style={{ padding: '12px' }}>{Number(stock).toFixed(2)} {item.unit}</td>
                        <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{Number(parLevel).toFixed(2)} {item.unit}</td>
                        <td style={{ padding: '12px', color: rowStatus === 'critical' ? 'var(--pp-danger-text)' : 'var(--pp-text-muted)', fontWeight: rowStatus === 'critical' ? 600 : 400 }}>
                          {item.stockout_at
                            ? new Date(item.stockout_at) <= new Date()
                              ? (i18n.language === 'vi' ? '⚠ Đã hết hàng' : '⚠ Out of stock')
                              : t('boh.willRunOutBy', { time: formatTime(new Date(item.stockout_at), i18n.language) })
                            : '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <input
                            type="number" min="0" step="100"
                            value={localUnitCost[item.sku] !== undefined ? localUnitCost[item.sku] : (item.cost_per_unit ?? '')}
                            placeholder="0"
                            onChange={(e) => setLocalUnitCost((p) => ({ ...p, [item.sku]: parseFloat(e.target.value) || 0 }))}
                            style={{ width: '80px', padding: '3px 6px', border: '1px solid var(--pp-border)', borderRadius: '4px', fontSize: '13px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button onClick={() => updateStock(item.sku, stock - 0.5)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', color: 'var(--pp-text)', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
                            <input type="number" value={stock} step="0.5" min="0"
                              onChange={(e) => updateStock(item.sku, parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', padding: '4px 6px', border: '1px solid var(--pp-border)', borderRadius: '6px', fontSize: '13px', textAlign: 'center', background: 'white', color: 'var(--pp-text)' }}
                            />
                            <button onClick={() => updateStock(item.sku, stock + 0.5)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-primary-border)', background: 'var(--pp-primary-light)', color: 'var(--pp-primary-text)', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                            {(localStock[item.sku] !== undefined || localUnitCost[item.sku] !== undefined) && (
                              <button
                                onClick={() => saveStock(item)}
                                style={{ padding: '4px 12px', borderRadius: '8px', border: 'none', background: 'var(--pp-primary)', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                {i18n.language === 'vi' ? 'Lưu' : 'Save'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => { setEditingInvSku(item.sku); setEditInvValues({ name_en: item.name_en || '', name_vi: item.name_vi || '', unit: item.unit || '', par_level: String(item.par_level ?? '') }); setInvError(null) }}
                              style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer', color: 'var(--pp-text-muted)' }}
                            >{i18n.language === 'vi' ? 'Sửa' : 'Edit'}</button>
                            <button
                              onClick={() => handleDeleteInventoryItem(item.sku)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--pp-danger-text)', cursor: 'pointer', fontSize: '16px', fontWeight: 700, lineHeight: 1 }}
                              title={i18n.language === 'vi' ? 'Xoá' : 'Delete'}
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab B: Recipes ── */}
      {activeTab === 'recipes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
              {i18n.language === 'vi' ? 'Công thức món ăn' : 'Dish Recipes'}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => exportCsv('recipes', ['SKU', 'Name EN', 'Name VI', 'Price (VND)', 'Ingredients'],
                  (menuItems || []).map((d) => [d.sku, d.name_en, d.name_vi, d.unit_price, (d.recipes || []).map((r) => `${r.qty}${r.unit || ''} ${r.ingredient_name_en || r.ingredient_sku}`).join('; ')])
                )}
                style={{ background: 'white', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}</button>
              <button
                onClick={() => { setShowAddDish(true); setRecipeError(null) }}
                style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                + {i18n.language === 'vi' ? 'Thêm món mới' : 'Add Dish'}
              </button>
            </div>
          </div>

          {recipeError && (
            <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '12px' }}>{recipeError}</p>
          )}

          {/* Add Dish Form */}
          {showAddDish && (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 12px' }}>
                {i18n.language === 'vi' ? 'Tạo món mới' : 'New Dish'}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input
                  placeholder="Name (EN)"
                  value={newDish.name_en}
                  onChange={(e) => setNewDish((d) => ({ ...d, name_en: e.target.value }))}
                  style={{ flex: 1, minWidth: '140px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
                />
                <input
                  placeholder="Tên (VI)"
                  value={newDish.name_vi}
                  onChange={(e) => setNewDish((d) => ({ ...d, name_vi: e.target.value }))}
                  style={{ flex: 1, minWidth: '140px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
                />
                <input
                  type="number" placeholder={i18n.language === 'vi' ? 'Giá (VND)' : 'Price (VND)'}
                  value={newDish.unit_price}
                  onChange={(e) => setNewDish((d) => ({ ...d, unit_price: e.target.value }))}
                  style={{ width: '130px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddDish} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Tạo' : 'Create'}
                </button>
                <button onClick={() => { setShowAddDish(false); setRecipeError(null) }} style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Huỷ' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Dish Cards */}
          {menuItems === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : menuItems.length === 0 ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>
              {i18n.language === 'vi' ? 'Chưa có món nào' : 'No dishes yet'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {menuItems.map((dish) => {
                const dishCost = (dish.recipes || []).reduce((sum, r) => {
                  const inv = invMap[r.ingredient_sku]
                  return sum + r.qty * (inv?.cost_per_unit ?? 0)
                }, 0)
                const hasCost = (dish.recipes || []).some((r) => invMap[r.ingredient_sku]?.cost_per_unit)
                const margin = dish.unit_price && dishCost ? ((dish.unit_price - dishCost) / dish.unit_price * 100).toFixed(1) : null

                return (
                  <div key={dish.sku} style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Dish header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-yellow)' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '15px', margin: '0 0 2px' }}>
                          {i18n.language === 'vi' ? dish.name_vi : dish.name_en}
                          <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--pp-text-muted)', marginLeft: '8px' }}>
                            {i18n.language === 'vi' ? dish.name_en : dish.name_vi}
                          </span>
                        </p>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--pp-text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>
                            {i18n.language === 'vi' ? 'Giá bán:' : 'Price:'}
                            {' '}
                            <input
                              type="number" defaultValue={dish.unit_price} min="0"
                              onBlur={(e) => handleUpdateDishPrice(dish, e.target.value)}
                              style={{ width: '90px', border: '1px solid var(--pp-border)', borderRadius: '4px', padding: '2px 6px', fontSize: '13px' }}
                            />
                          </span>
                          <span style={{ color: hasCost ? 'var(--pp-text)' : 'var(--pp-text-hint)' }}>
                            {i18n.language === 'vi' ? 'Giá vốn:' : 'Cost:'} {hasCost ? formatVnd(dishCost, i18n.language) : '—'}
                          </span>
                          {margin && (
                            <span style={{ color: Number(margin) >= 60 ? 'var(--pp-success-text)' : Number(margin) >= 30 ? 'var(--pp-warning-text)' : 'var(--pp-danger-text)', fontWeight: 600 }}>
                              {i18n.language === 'vi' ? 'Biên lợi:' : 'Margin:'} {margin}%
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDish(dish.sku)}
                        style={{ background: 'transparent', border: '1px solid var(--pp-danger-text)', color: 'var(--pp-danger-text)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {i18n.language === 'vi' ? 'Xoá món' : 'Delete Dish'}
                      </button>
                    </div>

                    {/* Ingredients table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: 'var(--pp-neutral-bg)' }}>
                          {[
                            i18n.language === 'vi' ? 'Nguyên liệu' : 'Ingredient',
                            i18n.language === 'vi' ? 'Lượng dùng/phần' : 'Qty/serving',
                            i18n.language === 'vi' ? 'Giá/đơn vị → Chi phí/phần' : 'Cost/unit → Cost/serving',
                            '',
                          ].map((h, i) => (
                            <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(dish.recipes || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ padding: '12px', color: 'var(--pp-text-hint)', fontSize: '13px' }}>
                              {i18n.language === 'vi' ? 'Chưa có nguyên liệu' : 'No ingredients yet'}
                            </td>
                          </tr>
                        ) : (dish.recipes || []).map((r) => {
                          const inv = invMap[r.ingredient_sku]
                          const lineCost = r.qty * (inv?.cost_per_unit ?? 0)
                          const isEditing = editingIngredient?.dishId === dish.sku && editingIngredient?.ingredient_sku === r.ingredient_sku
                          return (
                            <tr key={r.ingredient_sku} style={{ borderTop: '1px solid var(--pp-border)', background: isEditing ? 'var(--pp-info-bg)' : 'transparent' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                                {i18n.language === 'vi' ? (inv?.name_vi || r.ingredient_name_vi || r.ingredient_sku) : (inv?.name_en || r.ingredient_name_en || r.ingredient_sku)}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                      type="number" min="0" step="0.01" value={editValues.qty}
                                      onChange={(e) => setEditValues((v) => ({ ...v, qty: e.target.value }))}
                                      style={{ width: '70px', border: '1px solid var(--pp-border)', borderRadius: '4px', padding: '3px 6px', fontSize: '13px' }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--pp-text-muted)' }}>{inv?.unit || ''}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--pp-text-muted)' }}>{r.qty} {inv?.unit || ''}</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isEditing ? (
                                  <input
                                    type="number" min="0" step="100"
                                    value={editValues.cost_per_unit}
                                    placeholder={i18n.language === 'vi' ? 'Giá/đơn vị' : 'Cost/unit'}
                                    onChange={(e) => setEditValues((v) => ({ ...v, cost_per_unit: e.target.value }))}
                                    style={{ width: '100px', border: '1px solid var(--pp-border)', borderRadius: '4px', padding: '3px 6px', fontSize: '13px' }}
                                  />
                                ) : (
                                  <span style={{ color: inv?.cost_per_unit ? 'var(--pp-text)' : 'var(--pp-text-hint)' }}>
                                    {inv?.cost_per_unit ? formatVnd(lineCost, i18n.language) : '—'}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => handleSaveIngredientEdit(dish)}
                                      style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      {i18n.language === 'vi' ? 'Lưu' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingIngredient(null); setRecipeError(null) }}
                                      style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}
                                    >✕</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => startEditIngredient(dish, r)}
                                      style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer', color: 'var(--pp-text-muted)' }}
                                    >
                                      {i18n.language === 'vi' ? 'Sửa' : 'Edit'}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteIngredient(dish, r.ingredient_sku)}
                                      style={{ background: 'transparent', border: 'none', color: 'var(--pp-danger-text)', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
                                    >✕</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Add Ingredient */}
                    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--pp-border)' }}>
                      {addIngredientTo === dish.sku ? (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <select
                            value={newIngredient.ingredient_sku}
                            onChange={(e) => setNewIngredient((n) => ({ ...n, ingredient_sku: e.target.value }))}
                            style={{ flex: 1, minWidth: '160px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                          >
                            <option value="">{i18n.language === 'vi' ? '— Chọn nguyên liệu —' : '— Select ingredient —'}</option>
                            {(inventoryRaw || []).map((inv) => (
                              <option key={inv.sku} value={inv.sku}>
                                {i18n.language === 'vi' ? inv.name_vi : inv.name_en} ({inv.unit})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number" min="0" step="0.01"
                            placeholder={i18n.language === 'vi' ? 'Lượng dùng' : 'Qty'}
                            value={newIngredient.qty}
                            onChange={(e) => setNewIngredient((n) => ({ ...n, qty: e.target.value }))}
                            style={{ width: '90px', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                          />
                          <button
                            onClick={() => handleAddIngredient(dish)}
                            style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {i18n.language === 'vi' ? 'Thêm' : 'Add'}
                          </button>
                          <button
                            onClick={() => { setAddIngredientTo(null); setNewIngredient({ ingredient_sku: '', qty: '' }); setRecipeError(null) }}
                            style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer' }}
                          >
                            {i18n.language === 'vi' ? 'Huỷ' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddIngredientTo(dish.sku); setNewIngredient({ ingredient_sku: '', qty: '' }); setRecipeError(null) }}
                          style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--pp-text-muted)' }}
                        >
                          + {i18n.language === 'vi' ? 'Thêm nguyên liệu' : 'Add ingredient'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab C: Labor ── */}
      {activeTab === 'labor' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{t('boh.labor')}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => exportCsv('labor', ['Name', 'Role', 'Shift Start', 'Shift End', 'Status'],
                  (staffShifts || []).map((s) => {
                    const start = toDate(s.shift_start); const end = toDate(s.shift_end)
                    const isOn = start && end && start <= now && now <= end
                    return [s.name, s.role, start ? start.toISOString() : '', end ? end.toISOString() : '', isOn ? 'On shift' : 'Off']
                  })
                )}
                style={{ background: 'white', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}</button>
              <button
                onClick={() => { setShowAddStaff(true); setStaffError(null) }}
                style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                + {i18n.language === 'vi' ? 'Thêm nhân viên' : 'Add Staff'}
              </button>
            </div>
          </div>

          {staffError && <p style={{ color: 'var(--pp-danger-text)', fontSize: '13px', marginBottom: '10px' }}>{staffError}</p>}

          {showAddStaff && (
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 12px' }}>
                {i18n.language === 'vi' ? 'Ca làm mới' : 'New Staff Shift'}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input placeholder={i18n.language === 'vi' ? 'Tên nhân viên' : 'Staff name'} value={newStaff.name}
                  onChange={(e) => setNewStaff((s) => ({ ...s, name: e.target.value }))}
                  style={{ flex: 1, minWidth: '140px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <input placeholder={i18n.language === 'vi' ? 'Vai trò' : 'Role'} value={newStaff.role}
                  onChange={(e) => setNewStaff((s) => ({ ...s, role: e.target.value }))}
                  style={{ flex: 1, minWidth: '120px', border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--pp-text-muted)' }}>{i18n.language === 'vi' ? 'Bắt đầu' : 'Shift start'}</label>
                  <input type="datetime-local" value={newStaff.shift_start}
                    onChange={(e) => setNewStaff((s) => ({ ...s, shift_start: e.target.value }))}
                    style={{ border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--pp-text-muted)' }}>{i18n.language === 'vi' ? 'Kết thúc' : 'Shift end'}</label>
                  <input type="datetime-local" value={newStaff.shift_end}
                    onChange={(e) => setNewStaff((s) => ({ ...s, shift_end: e.target.value }))}
                    style={{ border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddStaff} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '7px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Thêm' : 'Add'}
                </button>
                <button onClick={() => { setShowAddStaff(false); setStaffError(null) }} style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>
                  {i18n.language === 'vi' ? 'Huỷ' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {staffShifts === null ? (
            <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
          ) : (
            <>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}>
                {t('boh.staffOnShift', { count: onShiftNow.length })} · {t('boh.recentOrders', { count: recentOrderVolume })}
              </p>
              {staffingFlag !== 'ok' && (
                <div style={{ background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: 'var(--pp-warning-text)', marginBottom: '14px', display: 'inline-block' }}>
                  {t(`boh.staffingFlag.${staffingFlag}`)}
                </div>
              )}
              <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                      {[i18n.language === 'vi' ? 'Nhân viên' : 'Staff', i18n.language === 'vi' ? 'Vai trò' : 'Role', i18n.language === 'vi' ? 'Ca làm' : 'Shift', i18n.language === 'vi' ? 'Trạng thái' : 'Status', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffShifts.map((s) => {
                      const isOn = onShiftNow.some((o) => o.staff_id === s.staff_id)
                      const start = toDate(s.shift_start); const end = toDate(s.shift_end)
                      const isEditingRow = editingStaffId === s.staff_id
                      if (isEditingRow) {
                        return (
                          <tr key={s.staff_id} style={{ borderBottom: '1px solid var(--pp-border)', background: 'var(--pp-info-bg)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <input value={editStaffValues.name} onChange={(e) => setEditStaffValues((v) => ({ ...v, name: e.target.value }))}
                                placeholder={i18n.language === 'vi' ? 'Tên' : 'Name'} style={{ width: '100%', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <input value={editStaffValues.role} onChange={(e) => setEditStaffValues((v) => ({ ...v, role: e.target.value }))}
                                placeholder={i18n.language === 'vi' ? 'Vai trò' : 'Role'} style={{ width: '100%', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                            </td>
                            <td style={{ padding: '8px 12px' }} colSpan={2}>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input type="datetime-local" value={editStaffValues.shift_start} onChange={(e) => setEditStaffValues((v) => ({ ...v, shift_start: e.target.value }))}
                                  style={{ border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                                <span style={{ color: 'var(--pp-text-muted)', fontSize: '13px' }}>–</span>
                                <input type="datetime-local" value={editStaffValues.shift_end} onChange={(e) => setEditStaffValues((v) => ({ ...v, shift_end: e.target.value }))}
                                  style={{ border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }} />
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => handleSaveStaffEdit(s.staff_id)} style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                  {i18n.language === 'vi' ? 'Lưu' : 'Save'}
                                </button>
                                <button onClick={() => { setEditingStaffId(null); setStaffError(null) }} style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      return (
                        <tr key={s.staff_id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                          <td style={{ padding: '12px', fontWeight: 500 }}>{s.name}</td>
                          <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.role}</td>
                          <td style={{ padding: '12px', color: 'var(--pp-text-muted)', fontSize: '13px' }}>
                            {start && end ? `${formatTime(start, i18n.language)} – ${formatTime(end, i18n.language)}` : '—'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
                              background: isOn ? 'var(--pp-success-bg)' : 'var(--pp-neutral-bg)',
                              color: isOn ? 'var(--pp-success-text)' : 'var(--pp-neutral-text)',
                            }}>{isOn ? t('boh.shiftStatus.on') : t('boh.shiftStatus.off')}</span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => {
                                  const fmt = (d) => d ? d.toISOString().slice(0, 16) : ''
                                  setEditingStaffId(s.staff_id)
                                  setEditStaffValues({ name: s.name || '', role: s.role || '', shift_start: fmt(start), shift_end: fmt(end) })
                                  setStaffError(null)
                                }}
                                style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer', color: 'var(--pp-text-muted)' }}
                              >{i18n.language === 'vi' ? 'Sửa' : 'Edit'}</button>
                              <button
                                onClick={() => handleDeleteStaff(s.staff_id)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--pp-danger-text)', cursor: 'pointer', fontSize: '16px', fontWeight: 700, lineHeight: 1 }}
                                title={i18n.language === 'vi' ? 'Xoá' : 'Delete'}
                              >✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '14px', background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--pp-warning-text)' }}>
                {t('boh.laborAiForecast')}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab C: Supply & Revenue ── */}
      {activeTab === 'supply' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Profit Snapshot */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{t('boh.profitSnapshot')}</h2>
            {profit === null ? (
              <p style={{ color: 'var(--pp-text-muted)', fontSize: '14px' }}>{t('common.loading')}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px' }}>
                {[
                  { label: t('dashboard.todayRevenue'), value: formatVnd(profit.revenue, i18n.language) },
                  { label: t('boh.foodCost'),   value: formatVnd(profit.food_cost, i18n.language) },
                  { label: t('boh.laborCost'),  value: formatVnd(profit.labor_cost, i18n.language) },
                  { label: t('boh.profit'),     value: formatVnd(profit.profit, i18n.language) },
                ].map((item) => (
                  <div key={item.label} style={card}>
                    <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', margin: '0 0 4px' }}>{item.label}</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revenue Export */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{i18n.language === 'vi' ? 'Xuất báo cáo doanh thu' : 'Export Revenue Report'}</h2>
            </div>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--pp-text-muted)', fontWeight: 500 }}>
                {i18n.language === 'vi' ? 'Xuất theo khoảng thời gian:' : 'Export by period:'}
              </span>
              {[
                { label: i18n.language === 'vi' ? 'Hôm nay' : 'Today', days: 0 },
                { label: i18n.language === 'vi' ? '7 ngày' : '7 Days', days: 7 },
                { label: i18n.language === 'vi' ? '30 ngày' : '30 Days', days: 30 },
              ].map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => {
                    const cutoff = new Date()
                    if (days === 0) cutoff.setHours(0, 0, 0, 0)
                    else { cutoff.setDate(cutoff.getDate() - days); cutoff.setHours(0, 0, 0, 0) }

                    const inRange = (allOrders || []).filter((o) => new Date(o.created_at) >= cutoff)

                    const headers = ['Order ID', 'Created At', 'Table', 'Status', 'Payment Method', 'Total (VND)', 'Items']
                    const rows = inRange.map((o) => {
                      const items = Array.isArray(o.items)
                        ? o.items.map((it) => `${it.qty || 1}x ${it.name_en || it.name || it.sku || ''}`).join('; ')
                        : ''
                      return [
                        o.id,
                        o.created_at ? new Date(o.created_at).toLocaleString() : '',
                        o.table_id || '',
                        o.status || '',
                        o.payment_method || '',
                        o.total_amount ?? '',
                        items,
                      ]
                    })

                    exportCsv(`orders_${label.toLowerCase().replace(/\s/g, '_')}`, headers, rows)
                  }}
                  style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '8px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ↓ {label}
                </button>
              ))}
              {allOrders === null && (
                <span style={{ fontSize: '12px', color: 'var(--pp-text-muted)' }}>{t('common.loading')}</span>
              )}
            </div>
          </div>

          {/* Revenue by Channel */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{t('boh.channels')}</h2>
              <button
                onClick={() => exportCsv('revenue_channels', ['Channel', 'Orders', 'Revenue (VND)'],
                  STATIC_CHANNELS.map((c) => [c.name_en, c.orders, c.revenue])
                )}
                style={{ background: 'white', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}</button>
            </div>
            <div style={{ background: 'var(--pp-warning-bg)', border: '1px solid var(--pp-warning-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '14px', color: 'var(--pp-warning-text)' }}>
              {t('boh.channelAiInsight')}
            </div>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.channelName'), t('boh.channelOrders'), t('boh.channelRevenue')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATIC_CHANNELS.map((c) => (
                    <tr key={c.name_en} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px' }}>{i18n.language === 'vi' ? c.name_vi : c.name_en}</td>
                      <td style={{ padding: '12px' }}>{c.orders}</td>
                      <td style={{ padding: '12px' }}>{formatVnd(c.revenue, i18n.language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Supply Monitoring */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{t('boh.supply')}</h2>
              <button
                onClick={() => exportCsv('suppliers', ['Supplier', 'Items', 'Last Delivery', 'Reliability (%)'],
                  STATIC_SUPPLIERS.map((s) => [s.name, s.items, s.lastDelivery, s.reliability])
                )}
                style={{ background: 'white', color: 'var(--pp-text)', border: '1px solid var(--pp-border)', borderRadius: '99px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >↓ {i18n.language === 'vi' ? 'Xuất CSV' : 'Export CSV'}</button>
            </div>
            <div style={{ background: 'var(--pp-info-bg)', border: '1px solid var(--pp-info-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '14px', color: 'var(--pp-info-text)' }}>
              {t('boh.supplyAiForecast')}
            </div>
            <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
                    {[t('boh.supplier'), t('boh.items'), t('boh.lastDelivery'), t('boh.reliability')].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATIC_SUPPLIERS.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.items}</td>
                      <td style={{ padding: '12px', color: 'var(--pp-text-muted)' }}>{s.lastDelivery}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 600,
                          background: s.reliability >= 90 ? 'var(--pp-success-bg)' : s.reliability >= 70 ? 'var(--pp-warning-bg)' : 'var(--pp-danger-bg)',
                          color: s.reliability >= 90 ? 'var(--pp-success-text)' : s.reliability >= 70 ? 'var(--pp-warning-text)' : 'var(--pp-danger-text)',
                        }}>{s.reliability}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
