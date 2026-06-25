# FOH/BOH Order Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul FOH table lifecycle, enforce kitchen readiness before serving, add VNPay QR payment, link reservations to tables, persist all state to Firestore, and remove BOH kitchen tab.

**Architecture:** All changes are in two frontend pages (FrontOfHouse.jsx, BackOfHouse.jsx) plus a new VnpayReturn page, a new backend VNPay router, and i18n additions. No new Firestore collections — only new fields on existing docs. VNPay URL signing happens exclusively on the backend to keep the hash secret out of the browser.

**Tech Stack:** React + Vite, Firebase/Firestore (onSnapshot), react-router-dom, react-i18next, Express (backend), Node.js built-in `crypto` + `querystring` (VNPay signing), `qrcode.react` (QR display)

## Global Constraints

- All Firestore writes use the existing `db` import from `../services/firebase`
- i18n strings must be added to BOTH `frontend/src/locales/en/translation.json` AND `frontend/src/locales/vi/translation.json`
- VNPay hash secret and TMN code are ONLY in `backend/.env` — never in frontend code
- Payment methods list: `['cash', 'vnpay']` — no `card`, no `momo`
- Table state machine: `open` → `reserved` → `dining` → `cleanup` → `open`
- VNPay sandbox URL: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
- Return URL: `https://final-wine-five.vercel.app/vnpay-return`
- Backend API base: `http://localhost:4000` (via `VITE_API_BASE_URL` env var)

---

### Task 1: BOH — Remove Kitchen Tab

**Files:**
- Modify: `frontend/src/pages/BackOfHouse.jsx`

**Interfaces:**
- Produces: BOH with tabs: Inventory, Labor, Supply & Revenue (no Kitchen)

- [ ] **Step 1: Change default active tab**

In `BackOfHouse.jsx`, change:
```jsx
const [activeTab, setActiveTab] = useState('kitchen')
```
to:
```jsx
const [activeTab, setActiveTab] = useState('inventory')
```

- [ ] **Step 2: Remove kitchen from tabs array**

Change the `tabs` array from:
```jsx
const tabs = [
  { id: 'kitchen',   label: t('boh.kitchen') },
  { id: 'inventory', label: i18n.language === 'vi' ? 'Tồn kho' : 'Inventory' },
  { id: 'labor',     label: i18n.language === 'vi' ? 'Nhân sự' : 'Labor' },
  { id: 'supply',    label: i18n.language === 'vi' ? 'Cung ứng & Doanh thu' : 'Supply & Revenue' },
]
```
to:
```jsx
const tabs = [
  { id: 'inventory', label: i18n.language === 'vi' ? 'Tồn kho' : 'Inventory' },
  { id: 'labor',     label: i18n.language === 'vi' ? 'Nhân sự' : 'Labor' },
  { id: 'supply',    label: i18n.language === 'vi' ? 'Cung ứng & Doanh thu' : 'Supply & Revenue' },
]
```

- [ ] **Step 3: Delete kitchen render block**

Delete the entire JSX block `{/* ── Kitchen Tab ── */}` through its closing `)}` (the block that conditionally renders when `activeTab === 'kitchen'`).

- [ ] **Step 4: Remove kitchenQueue state, subscription, and handleAdvanceQueueItem**

Remove:
```jsx
const [kitchenQueue, setKitchenQueue] = useState(null)
```

Remove from `useEffect`:
```jsx
const unsubQueue = onSnapshot(collection(db, 'kitchen_queue'), (snap) => {
  setKitchenQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
})
```
And remove `unsubQueue()` from the cleanup return.

Remove the entire `handleAdvanceQueueItem` function.

- [ ] **Step 5: Verify**

`cd frontend && npm run dev` → navigate to BOH. Tabs shown: Inventory, Labor, Supply & Revenue. No Kitchen tab.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BackOfHouse.jsx
git commit -m "feat: remove kitchen tab from BOH"
```

---

### Task 2: i18n — Add New Translation Keys

**Files:**
- Modify: `frontend/src/locales/en/translation.json`
- Modify: `frontend/src/locales/vi/translation.json`

**Interfaces:**
- Produces: Translation keys consumed in Tasks 3–10

- [ ] **Step 1: Add keys to English translation**

In `frontend/src/locales/en/translation.json`, inside the `"foh"` object, add:

```json
"markClean": "Mark Clean / Open Table",
"waitingForKitchen": "Waiting for kitchen…",
"addMoreItems": "Add More Items",
"assignTable": "Assign Table",
"noTableAssigned": "No table assigned",
"addNote": "Add Note",
"notePlaceholder": "Add a note...",
"saveNote": "Save Note",
"vnpayQR": "Scan QR to pay with VNPay",
"confirmPayment": "Confirm Received",
"paymentCancelled": "Payment cancelled — try again"
```

- [ ] **Step 2: Add keys to Vietnamese translation**

In `frontend/src/locales/vi/translation.json`, inside the `"foh"` object, add:

```json
"markClean": "Đánh dấu sạch / Mở bàn",
"waitingForKitchen": "Đang chờ bếp…",
"addMoreItems": "Thêm món",
"assignTable": "Gán bàn",
"noTableAssigned": "Chưa gán bàn",
"addNote": "Thêm ghi chú",
"notePlaceholder": "Thêm ghi chú...",
"saveNote": "Lưu ghi chú",
"vnpayQR": "Quét QR để thanh toán VNPay",
"confirmPayment": "Xác nhận đã nhận",
"paymentCancelled": "Thanh toán thất bại — thử lại"
```

- [ ] **Step 3: Verify JSON syntax**

```bash
node -e "JSON.parse(require('fs').readFileSync('frontend/src/locales/en/translation.json','utf8')); JSON.parse(require('fs').readFileSync('frontend/src/locales/vi/translation.json','utf8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/en/translation.json frontend/src/locales/vi/translation.json
git commit -m "feat: add i18n keys for FOH order flow changes"
```

---

### Task 3: FOH — Cleanup → Open Button

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: `t('foh.markClean')` from Task 2
- Produces: "Mark Clean / Open Table" button in order panel when table.status === 'cleanup'

- [ ] **Step 1: Add handleMarkClean function**

After the `handleRecordPayment` function in `FrontOfHouse.jsx`, add:

```jsx
async function handleMarkClean(tableId) {
  setBusy(true); setError(null)
  try {
    await updateDoc(doc(db, 'tables', tableId), { status: 'open', seated_at: null })
    setSelectedTable(null)
    setPaymentConfirmation(null)
  } catch (e) {
    console.error(e)
    setError(t('common.error'))
  } finally { setBusy(false) }
}
```

- [ ] **Step 2: Add cleanup state rendering in order panel**

In the order panel, find the condition chain:
```jsx
{paymentConfirmation && paymentConfirmation.tableId === selectedTable ? (
  // payment confirmed screen
) : !activeOrder ? (
  <div>
    <p ...>Select items to create a new order</p>
    ...
  </div>
) : (
  // active order bill view
)}
```

Replace the `!activeOrder` arm with:

```jsx
) : !activeOrder ? (
  (() => {
    const tbl = tables.find((tb) => tb.table_id === selectedTable)
    if (tbl?.status === 'cleanup') {
      return (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧹</div>
          <p style={{ fontSize: '14px', color: 'var(--pp-text-muted)', marginBottom: '20px' }}>
            {i18n.language === 'vi' ? 'Bàn đang được dọn dẹp' : 'Table is being cleaned'}
          </p>
          <button
            disabled={busy}
            onClick={() => handleMarkClean(selectedTable)}
            style={{
              width: '100%', background: 'var(--pp-primary)', color: 'white',
              border: 'none', borderRadius: '99px', padding: '10px',
              fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? '…' : t('foh.markClean')}
          </button>
        </div>
      )
    }
    return (
      <div>
        <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', marginBottom: '12px' }}>
          {i18n.language === 'vi' ? 'Chọn món để tạo đơn hàng mới' : 'Select items to create a new order'}
        </p>
        {MENU_ITEMS.map((item) => (
          <div key={item.sku} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--pp-border)' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
              <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', margin: 0 }}>{formatVnd(item.unit_price, i18n.language)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>−</button>
              <span style={{ width: '22px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>{cart[item.sku] || 0}</span>
              <button onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>+</button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '16px' }}>{formatVnd(cartTotal, i18n.language)}</span>
          <button
            disabled={busy || cartItems.length === 0}
            onClick={handleCreateOrder}
            style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px 22px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: (busy || cartItems.length === 0) ? 0.5 : 1 }}
          >
            {busy ? '…' : t('foh.createOrder')}
          </button>
        </div>
      </div>
    )
  })()
```

- [ ] **Step 3: Verify**

Record payment on any served order → table goes to cleanup. Click that table → broom icon + "Mark Clean / Open Table" button appears. Click it → table returns to open.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: add cleanup→open button in FOH table panel"
```

---

### Task 4: FOH — Persist All Reservations to Firestore

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Produces: Reservation form writes directly to Firestore; `localReservations` state removed; new reservation docs have fields `{ guest_name, party_size, reservation_time, status, table_id: null, note: null }`

- [ ] **Step 1: Add addDoc to Firestore imports**

Change the import at the top of `FrontOfHouse.jsx`:

```jsx
import {
  addDoc, collection, doc, onSnapshot, query,
  runTransaction, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore'
```

- [ ] **Step 2: Remove localReservations state declaration**

Delete:
```jsx
const [localReservations, setLocalReservations] = useState([])
```

- [ ] **Step 3: Replace form submit handler with Firestore write**

Find the `onClick` inside the `formOpen` block that calls `setLocalReservations(...)`. Replace the entire `onClick` prop:

```jsx
onClick={async () => {
  if (!form.name.trim()) {
    setFormError(i18n.language === 'vi' ? 'Vui lòng nhập tên khách' : 'Please enter guest name')
    return
  }
  try {
    const [hh, mm] = form.time.split(':').map(Number)
    const resTime = new Date()
    resTime.setHours(hh, mm, 0, 0)
    await addDoc(collection(db, 'reservations'), {
      guest_name: form.name.trim(),
      party_size: form.partySize,
      reservation_time: resTime,
      status: 'confirmed',
      table_id: null,
      note: null,
    })
    setForm({ name: '', partySize: 2, time: '18:00' })
    setFormOpen(false)
    setFormError(null)
  } catch (e) {
    console.error(e)
    setFormError(i18n.language === 'vi' ? 'Lỗi khi lưu đặt bàn' : 'Error saving reservation')
  }
}}
```

- [ ] **Step 4: Remove allUpcoming local merge**

Find:
```jsx
const allUpcoming = [...upcoming, ...localReservations.filter((r) => r.status === 'confirmed')]
```
Replace with:
```jsx
const allUpcoming = upcoming
```

- [ ] **Step 5: Verify**

Add a reservation → it appears immediately (Firestore onSnapshot). Refresh page → still there.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: persist all reservations to Firestore, remove local state"
```

---

### Task 5: FOH — Reservation Table Assignment + Note

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: `t('foh.assignTable')`, `t('foh.noTableAssigned')`, `t('foh.addNote')`, `t('foh.notePlaceholder')`, `t('foh.saveNote')` from Task 2
- Produces: Each confirmed reservation row has a table dropdown (writes `table_id` to Firestore) and inline note editor (writes `note` to Firestore)

- [ ] **Step 1: Add note editing state**

Add after existing state declarations:

```jsx
const [editingNoteId, setEditingNoteId] = useState(null)
const [noteInput, setNoteInput] = useState('')
```

- [ ] **Step 2: Add assignment and note handlers**

After `handleMarkClean`, add:

```jsx
async function handleAssignTable(reservationId, tableId) {
  try {
    await updateDoc(doc(db, 'reservations', reservationId), { table_id: tableId || null })
  } catch (e) {
    console.error(e)
  }
}

async function handleSaveNote(reservationId) {
  try {
    await updateDoc(doc(db, 'reservations', reservationId), { note: noteInput.trim() || null })
    setEditingNoteId(null)
    setNoteInput('')
  } catch (e) {
    console.error(e)
  }
}
```

- [ ] **Step 3: Update reservations table header**

Replace the thead row in the reservations table:

```jsx
<tr style={{ background: 'var(--pp-yellow)', borderBottom: '1px solid var(--pp-border)' }}>
  {[
    t('guest.guestName'),
    t('guest.partySize'),
    t('guest.time'),
    t('foh.assignTable'),
    i18n.language === 'vi' ? 'Ghi chú' : 'Note',
    t('guest.status'),
  ].map((h) => (
    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--pp-text-muted)' }}>{h}</th>
  ))}
</tr>
```

- [ ] **Step 4: Replace reservation rows**

Replace the entire `{allUpcoming.map((r) => (` block:

```jsx
{allUpcoming.map((r) => (
  <tr key={r.id} style={{ borderBottom: '1px solid var(--pp-border)' }}>
    <td style={{ padding: '12px' }}>{r.guest_name}</td>
    <td style={{ padding: '12px' }}>{r.party_size}</td>
    <td style={{ padding: '12px' }}>
      {r.reservation_time ? formatDateTime(toDate(r.reservation_time), i18n.language) : r.time}
    </td>
    <td style={{ padding: '12px' }}>
      <select
        value={r.table_id || ''}
        onChange={(e) => handleAssignTable(r.id, e.target.value)}
        style={{ border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', background: 'white' }}
      >
        <option value="">{t('foh.noTableAssigned')}</option>
        {(tables || [])
          .filter((tb) => tb.status === 'open' || tb.table_id === r.table_id)
          .map((tb) => (
            <option key={tb.table_id} value={tb.table_id}>{tb.table_id}</option>
          ))}
      </select>
    </td>
    <td style={{ padding: '12px', minWidth: '160px' }}>
      {editingNoteId === r.id ? (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder={t('foh.notePlaceholder')}
            style={{ flex: 1, border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px' }}
          />
          <button
            onClick={() => handleSaveNote(r.id)}
            style={{ background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            {t('foh.saveNote')}
          </button>
          <button
            onClick={() => { setEditingNoteId(null); setNoteInput('') }}
            style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
          >✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: r.note ? 'var(--pp-text)' : 'var(--pp-text-hint)' }}>
            {r.note || '—'}
          </span>
          <button
            onClick={() => { setEditingNoteId(r.id); setNoteInput(r.note || '') }}
            style={{ background: 'transparent', border: '1px solid var(--pp-border)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t('foh.addNote')}
          </button>
        </div>
      )}
    </td>
    <td style={{ padding: '12px' }}>
      <span style={{
        borderRadius: '99px', padding: '3px 10px', fontSize: '12px', fontWeight: 500,
        background: r.status === 'confirmed' ? 'var(--pp-primary-light)' : r.status === 'completed' ? 'var(--pp-success-bg)' : 'var(--pp-neutral-bg)',
        color: r.status === 'confirmed' ? 'var(--pp-primary-text)' : r.status === 'completed' ? 'var(--pp-success-text)' : 'var(--pp-neutral-text)',
      }}>
        {t(`guest.statusLabel.${r.status}`)}
      </span>
    </td>
  </tr>
))}
```

- [ ] **Step 5: Verify**

- Open Reservations tab → confirmed rows show table dropdown and note button
- Assign a table → Firestore `reservations` doc updates with `table_id` (check Firebase console)
- Click Add Note, type text, Save → note shows in row; Firestore doc has `note` field

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: add table assignment and note to reservations"
```

---

### Task 6: FOH — Auto-Reserve Table ±10 Min + Show Guest Name on Table Card

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: `reservations` and `tables` from Firestore state (already subscribed)
- Produces: Tables auto-flip to 'reserved' when within ±10 min; table card shows guest name when reserved

- [ ] **Step 1: Add auto-reserve interval effect**

After the existing `useEffect` that sets up Firestore subscriptions, add:

```jsx
useEffect(() => {
  const checkReservations = () => {
    if (!reservations || !tables) return
    const now = Date.now()
    const TEN_MIN = 10 * 60 * 1000

    reservations.forEach((r) => {
      if (r.status !== 'confirmed' || !r.table_id) return
      const resTime = toDate(r.reservation_time)?.getTime()
      if (!resTime) return

      const inWindow = now >= resTime - TEN_MIN && now <= resTime + TEN_MIN
      const table = tables.find((tb) => tb.table_id === r.table_id)
      if (!table) return

      if (inWindow && table.status === 'open') {
        updateDoc(doc(db, 'tables', r.table_id), { status: 'reserved' }).catch(console.error)
      } else if (!inWindow && now > resTime + TEN_MIN && table.status === 'reserved') {
        updateDoc(doc(db, 'tables', r.table_id), { status: 'open' }).catch(console.error)
      }
    })
  }

  checkReservations()
  const interval = setInterval(checkReservations, 60 * 1000)
  return () => clearInterval(interval)
}, [reservations, tables])
```

- [ ] **Step 2: Show guest name on reserved table card**

Inside the `{tables.map((tb) => {` block, after the `elapsedMin` calculation, add:

```jsx
const reservationForTable = tb.status === 'reserved'
  ? (reservations || []).find((r) => r.table_id === tb.table_id && r.status === 'confirmed')
  : null
```

Then inside the table button JSX, after the `{elapsedMin !== null && (...)}` block, add:

```jsx
{reservationForTable && (
  <div style={{
    marginTop: '3px', fontSize: '10px', fontWeight: 600, color: '#854D0E',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px',
  }}>
    {reservationForTable.guest_name}
  </div>
)}
```

- [ ] **Step 3: Verify**

- Create a reservation with time = now + 2 minutes, assign it to an open table
- Within 1 minute the table card flips to yellow 'reserved' and shows the guest name
- After reservation_time + 10 min with no order → table flips back to open

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: auto-reserve table ±10min and show guest name on reserved card"
```

---

### Task 7: FOH — Block Mark Served Until Kitchen Ready

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: `t('foh.waitingForKitchen')` from Task 2
- Produces: Mark Served button disabled with "Waiting for kitchen…" when order.status === 'in_kitchen'

- [ ] **Step 1: Replace in_kitchen render block**

Find the entire `{activeOrder.status === 'in_kitchen' && (` block. Replace it:

```jsx
{activeOrder.status === 'in_kitchen' && (
  <div>
    <p style={{ fontSize: '13px', color: 'var(--pp-warning-text)', background: 'var(--pp-warning-bg)', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px' }}>
      🍳 {t('foh.inKitchen')}
    </p>
    <button
      disabled
      style={{
        width: '100%', background: 'var(--pp-border)', color: 'var(--pp-text-muted)',
        border: 'none', borderRadius: '99px', padding: '10px',
        fontWeight: 700, fontSize: '14px', cursor: 'not-allowed', opacity: 0.7,
      }}
    >
      {t('foh.waitingForKitchen')}
    </button>
  </div>
)}
```

- [ ] **Step 2: Verify**

- Create order, send to kitchen → in_kitchen banner shows + greyed "Waiting for kitchen…" button (unclickable)
- In FOH Orders tab, advance all queue items to Ready → back in Tables tab, "Mark Served" button is now active (green)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: block Mark Served until kitchen status is ready"
```

---

### Task 8: FOH — Add More Items on Served Order

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: `t('foh.addMoreItems')`, `t('foh.recordPayment')` from Task 2
- Consumes: `getDoc` from firebase/firestore
- Produces: "Add More Items" button; clicking shows item picker that appends to existing order and resets it to 'open'
- Note: payment method buttons in this task call `handleInitVnpay` (stub) — full implementation in Task 10

- [ ] **Step 1: Add getDoc to Firestore imports**

```jsx
import {
  addDoc, collection, doc, getDoc, onSnapshot, query,
  runTransaction, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore'
```

- [ ] **Step 2: Add addingMore state**

```jsx
const [addingMore, setAddingMore] = useState(false)
```

Reset it when selecting a table — in the table button `onClick`:

```jsx
onClick={() => { setSelectedTable(tb.table_id); setPaymentConfirmation(null); setError(null); setAddingMore(false) }}
```

- [ ] **Step 3: Add handleAddMoreItems function**

After `handleMarkServed`, add:

```jsx
async function handleAddMoreItems(orderId) {
  if (cartItems.length === 0) return
  setBusy(true); setError(null)
  try {
    const orderRef = doc(db, 'orders', orderId)
    const snap = await getDoc(orderRef)
    const existingItems = snap.data()?.items || []

    const newItems = cartItems.map(([sku, qty]) => {
      const item = MENU_ITEMS.find((m) => m.sku === sku)
      return { sku: item.sku, name_en: item.name_en, name_vi: item.name_vi, unit_price: item.unit_price, qty }
    })

    const merged = [...existingItems]
    for (const ni of newItems) {
      const idx = merged.findIndex((e) => e.sku === ni.sku)
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], qty: merged[idx].qty + ni.qty }
      } else {
        merged.push(ni)
      }
    }

    const total_amount = merged.reduce((s, i) => s + i.unit_price * i.qty, 0)
    await updateDoc(orderRef, { items: merged, total_amount, status: 'open' })
    setCart({})
    setAddingMore(false)
  } catch (e) {
    console.error(e)
    setError(t('common.error'))
  } finally { setBusy(false) }
}
```

- [ ] **Step 4: Add handleInitVnpay stub**

After `handleAddMoreItems`, add a stub (replaced in Task 10):

```jsx
async function handleInitVnpay(orderId, amount) {
  // implemented in Task 10
  console.log('VNPay stub', orderId, amount)
}
```

- [ ] **Step 5: Replace served+unpaid payment section**

Replace the entire `{activeOrder.status === 'served' && !activeOrder.payment_method && (` block:

```jsx
{activeOrder.status === 'served' && !activeOrder.payment_method && (
  <div>
    {addingMore ? (
      <div>
        <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', marginBottom: '12px' }}>
          {i18n.language === 'vi' ? 'Thêm món vào đơn hiện tại' : 'Add items to current order'}
        </p>
        {MENU_ITEMS.map((item) => (
          <div key={item.sku} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--pp-border)' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>{i18n.language === 'vi' ? item.name_vi : item.name_en}</p>
              <p style={{ fontSize: '12px', color: 'var(--pp-text-muted)', margin: 0 }}>{formatVnd(item.unit_price, i18n.language)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setCart((c) => ({ ...c, [item.sku]: Math.max(0, (c[item.sku] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>−</button>
              <span style={{ width: '22px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>{cart[item.sku] || 0}</span>
              <button onClick={() => setCart((c) => ({ ...c, [item.sku]: (c[item.sku] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--pp-border)', background: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>+</button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => { setAddingMore(false); setCart({}) }}
            style={{ flex: 1, border: '1px solid var(--pp-border)', background: 'white', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={busy || cartItems.length === 0}
            onClick={() => handleAddMoreItems(activeOrder.id)}
            style={{ flex: 1, background: 'var(--pp-primary)', color: 'white', border: 'none', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: (busy || cartItems.length === 0) ? 0.5 : 1 }}
          >
            {busy ? '…' : (i18n.language === 'vi' ? 'Gửi bếp' : 'Send to Kitchen')}
          </button>
        </div>
      </div>
    ) : (
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>{t('foh.recordPayment')}</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            disabled={busy}
            onClick={() => handleRecordPayment(activeOrder.id, 'cash', activeOrder.total_amount)}
            style={{ flex: 1, border: '2px solid var(--pp-border)', background: 'white', borderRadius: '8px', padding: '10px 6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            💵 Cash
          </button>
          <button
            disabled={busy}
            onClick={() => handleInitVnpay(activeOrder.id, activeOrder.total_amount)}
            style={{ flex: 1, border: '2px solid var(--pp-border)', background: 'white', borderRadius: '8px', padding: '10px 6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            📱 VNPay
          </button>
        </div>
        <button
          onClick={() => { setAddingMore(true); setCart({}) }}
          style={{ width: '100%', border: '2px solid var(--pp-primary)', background: 'transparent', color: 'var(--pp-primary)', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          {t('foh.addMoreItems')}
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Verify**

- Full flow: create order → kitchen → ready → mark served → payment panel shows Cash, VNPay, Add More Items
- Click "Add More Items" → item picker appears; select items → "Send to Kitchen" → order items merged, status back to 'open'
- Cash button records payment immediately; VNPay button logs to console (stub)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "feat: add More Items button and cash/vnpay payment split"
```

---

### Task 9: Backend — VNPay Payment Routes

**Files:**
- Create: `backend/src/routes/vnpay.js`
- Modify: `backend/src/server.js`
- Modify: `backend/.env`

**Interfaces:**
- Produces:
  - `POST /api/vnpay/create-payment-url` body `{ orderId: string, amount: number }` → `{ paymentUrl: string }`
  - `GET /api/vnpay/verify-return?vnp_*=...` → `{ success: boolean, responseCode: string, orderId: string, amount: number }`

- [ ] **Step 1: Add VNPay env vars to backend/.env**

Add to `backend/.env`:

```env
VNPAY_TMN_CODE=DEMOV210
VNPAY_HASH_SECRET=RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ
VNPAY_SANDBOX_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://final-wine-five.vercel.app/vnpay-return
```

Replace `DEMOV210` and `RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ` with your real credentials.

- [ ] **Step 2: Create backend/src/routes/vnpay.js**

```js
import crypto from 'crypto'
import querystring from 'querystring'
import { Router } from 'express'

const router = Router()

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = obj[k]
    return acc
  }, {})
}

function formatVnDate(date) {
  const d = new Date(date.getTime() + 7 * 60 * 60 * 1000) // UTC+7
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

router.post('/create-payment-url', (req, res) => {
  const { orderId, amount } = req.body
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount required' })
  }

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_Amount: String(Math.round(amount) * 100),
    vnp_CreateDate: formatVnDate(new Date()),
    vnp_CurrCode: 'VND',
    vnp_IpAddr: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TxnRef: orderId,
  }

  const sorted = sortObject(params)
  const signData = querystring.stringify(sorted)
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET)
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

  const paymentUrl = `${process.env.VNPAY_SANDBOX_URL}?${querystring.stringify({ ...sorted, vnp_SecureHash: signed })}`
  res.json({ paymentUrl })
})

router.get('/verify-return', (req, res) => {
  const { vnp_SecureHash, vnp_SecureHashType, ...vnpParams } = req.query

  const sorted = sortObject(vnpParams)
  const signData = querystring.stringify(sorted)
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET)
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

  const isValid = signed === vnp_SecureHash
  const isSuccess = vnpParams.vnp_ResponseCode === '00'

  res.json({
    success: isValid && isSuccess,
    responseCode: vnpParams.vnp_ResponseCode || '',
    orderId: vnpParams.vnp_TxnRef || '',
    amount: vnpParams.vnp_Amount ? Number(vnpParams.vnp_Amount) / 100 : 0,
  })
})

export default router
```

- [ ] **Step 3: Mount VNPay router in server.js**

Open `backend/src/server.js`. Add import after existing route imports:

```js
import vnpayRouter from './routes/vnpay.js'
```

Add mount after existing `app.use(...)` route mounts:

```js
app.use('/api/vnpay', vnpayRouter)
```

- [ ] **Step 4: Verify backend**

```bash
cd backend && npm run dev
```

Then in another terminal:
```bash
curl -X POST http://localhost:4000/api/vnpay/create-payment-url \
  -H "Content-Type: application/json" \
  -d '{"orderId":"test-order-1","amount":150000}'
```

Expected: `{"paymentUrl":"https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=15000000&...&vnp_SecureHash=<64-char-hex>"}`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/vnpay.js backend/src/server.js backend/.env
git commit -m "feat: add VNPay create-payment-url and verify-return backend routes"
```

---

### Task 10: Frontend — VNPay QR Modal + Return Page

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`
- Create: `frontend/src/pages/VnpayReturn.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `POST /api/vnpay/create-payment-url` → `{ paymentUrl }` from Task 9
- Consumes: `GET /api/vnpay/verify-return` from Task 9
- Consumes: `t('foh.vnpayQR')`, `t('foh.confirmPayment')` from Task 2
- Produces: QR modal overlay in FOH; `/vnpay-return` page for customer redirect

- [ ] **Step 1: Install qrcode.react**

```bash
cd "/Users/hgiang/Downloads/GROUP 13/FINAL/frontend" && npm install qrcode.react
```

Expected: added to `node_modules` and `package.json`.

- [ ] **Step 2: Import QRCodeSVG in FrontOfHouse.jsx**

```jsx
import { QRCodeSVG } from 'qrcode.react'
```

- [ ] **Step 3: Add vnpayModal state**

```jsx
const [vnpayModal, setVnpayModal] = useState(null) // { orderId, amount, paymentUrl }
```

- [ ] **Step 4: Replace handleInitVnpay stub with real implementation**

Replace the stub from Task 8:

```jsx
async function handleInitVnpay(orderId, amount) {
  setBusy(true); setError(null)
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/vnpay/create-payment-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amount }),
    })
    const data = await res.json()
    if (!data.paymentUrl) throw new Error('No payment URL returned')
    setVnpayModal({ orderId, amount, paymentUrl: data.paymentUrl })
  } catch (e) {
    console.error(e)
    setError(i18n.language === 'vi' ? 'Không thể tạo mã QR thanh toán' : 'Could not generate payment QR')
  } finally { setBusy(false) }
}
```

- [ ] **Step 5: Add QR modal overlay to FOH render**

Inside `return (...)`, just before the final closing `</div>`, add:

```jsx
{vnpayModal && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  }}>
    <div style={{
      background: 'white', borderRadius: '16px', padding: '32px 28px',
      textAlign: 'center', maxWidth: '340px', width: '90%',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>VNPay</h2>
      <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', marginBottom: '20px' }}>
        {t('foh.vnpayQR')}
      </p>
      <div style={{ display: 'inline-block', padding: '12px', background: 'white', border: '2px solid var(--pp-border)', borderRadius: '12px', marginBottom: '16px' }}>
        <QRCodeSVG value={vnpayModal.paymentUrl} size={200} />
      </div>
      <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>
        {formatVnd(vnpayModal.amount, i18n.language)}
      </p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => { setVnpayModal(null); setError(null) }}
          style={{ flex: 1, border: '1px solid var(--pp-border)', background: 'transparent', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          {t('common.cancel')}
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            await handleRecordPayment(vnpayModal.orderId, 'vnpay', vnpayModal.amount)
            setVnpayModal(null)
          }}
          style={{ flex: 1, background: '#0066CC', color: 'white', border: 'none', borderRadius: '99px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          {busy ? '…' : t('foh.confirmPayment')}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Create frontend/src/pages/VnpayReturn.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function VnpayReturn() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)

  useEffect(() => {
    const query = searchParams.toString()
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/vnpay/verify-return?${query}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ success: false, responseCode: 'error' }))
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '40px 32px', textAlign: 'center', maxWidth: '380px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
        {result === null ? (
          <p style={{ color: '#6B7280' }}>Verifying payment…</p>
        ) : result.success ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>Payment Successful</h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
              Your payment has been received. Please return to your table.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{ background: '#E8002A', color: 'white', border: 'none', borderRadius: '99px', padding: '12px 28px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
            >
              Back to Home
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>❌</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>Payment Failed</h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '8px' }}>Code: {result.responseCode}</p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
              Please try again or use a different payment method.
            </p>
            <button
              onClick={() => window.close()}
              style={{ background: '#6B7280', color: 'white', border: 'none', borderRadius: '99px', padding: '12px 28px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Add /vnpay-return route to App.jsx**

Add import in `App.jsx`:
```jsx
import VnpayReturn from './pages/VnpayReturn'
```

Inside `<Routes>`, add (outside ProtectedRoute — customers land here without logging in):
```jsx
<Route path="/vnpay-return" element={<VnpayReturn />} />
```

- [ ] **Step 8: Verify end-to-end**

Start both servers:
```bash
# Terminal 1
cd "/Users/hgiang/Downloads/GROUP 13/FINAL/backend" && npm run dev
# Terminal 2
cd "/Users/hgiang/Downloads/GROUP 13/FINAL/frontend" && npm run dev
```

- Full order flow: create → kitchen → ready → mark served
- In payment panel click "VNPay" → QR modal appears with scannable QR code
- Amount shown in modal matches order total
- Click "Confirm Received" → table moves to cleanup, payment confirmation screen shows with method "vnpay"
- Navigate to `http://localhost:5173/vnpay-return` → shows "Verifying payment…" then failure (no real params) — correct behaviour

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx frontend/src/pages/VnpayReturn.jsx frontend/src/App.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add VNPay QR payment modal and return page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Item 1 — Reservation linked to table, ±10min window, guest name on card: Tasks 4, 5, 6
- ✅ Item 1 — Note button on reservation: Task 5
- ✅ Item 2 — Continue ordering before charge: Task 8
- ✅ Item 3 — Kitchen must be ready before Mark Served: Task 7
- ✅ Item 4 — VNPay QR with sandbox: Tasks 9, 10
- ✅ Item 5 — Remove card/momo, keep cash+vnpay: Task 8
- ✅ Item 6 — Cleanup → Open button: Task 3
- ✅ Item 7 — All data in Firestore: Tasks 4, 5, 6, 10
- ✅ BOH kitchen removal: Task 1

**Placeholder scan:** None — all steps have complete code blocks.

**Type consistency:** `vnpayModal` is `{ orderId, amount, paymentUrl }` — set in Task 10 Step 3, written in Task 10 Step 4, consumed in Task 10 Step 5. `handleInitVnpay(orderId, amount)` stub in Task 8 Step 4, replaced in Task 10 Step 4. `handleAssignTable(reservationId, tableId)` defined and called in Task 5. All consistent.
