# Feature Gap Scaffold — Task 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold all ⚠️ Partial and ❌ Missing features identified in the gap analysis so every module in the 10-feature product table is at least visually complete with sample data, AI insight strings, and bilingual labels.

**Architecture:** Extend existing Firestore-connected pages (Dashboard, FrontOfHouse, BackOfHouse, GuestEngagement) with new sections and UI layers. For the two fully-missing modules (Online Ordering, Supply Monitoring) add local `useState` sample data panels inside existing pages — no new backend endpoints. AI insights are rule-based template strings computed from local/Firestore state; no extra API calls.

**Tech Stack:** React 18, Tailwind CSS, Recharts (already installed), react-i18next, Firebase Firestore, Vite.

## Global Constraints

- No backend changes, no new npm packages (Recharts and lucide-react already available).
- All UI text bilingual: add keys to both `src/locales/vi/translation.json` and `src/locales/en/translation.json`, use `t('key')` everywhere.
- Match existing Tailwind class patterns: `rounded-lg border border-gray-200 p-4`, `text-sm text-gray-500`, `bg-purple-600 text-white`, etc.
- Sample data for new local-state sections: Vietnamese names, VND amounts, Hanoi context.
- Do not delete or rename existing files, do not change existing useState keys.
- No React Router changes — all new content is sections inside existing pages.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/locales/vi/translation.json` | Modify | Add all new VI strings |
| `src/locales/en/translation.json` | Modify | Add all new EN strings |
| `src/pages/Dashboard.jsx` | Modify | Add AI daily summary + root cause insight section |
| `src/pages/FrontOfHouse.jsx` | Modify | Add minutesOccupied AI badge on table grid + spike detection alert |
| `src/pages/GuestEngagement.jsx` | Modify | Add reservation form, AI peak forecast banner, loyalty tiers/points/at-risk insight |
| `src/pages/BackOfHouse.jsx` | Modify | Add 3-column kanban for kitchen orders, shift start/end display, AI staffing forecast, Supply Monitoring section, Online Ordering channel section |

---

### Task 1: Translations — Add all new i18n keys

**Files:**
- Modify: `src/locales/vi/translation.json`
- Modify: `src/locales/en/translation.json`

- [ ] Add the following keys to the `"foh"` namespace in vi:
```json
"tableAiInsight": "Bàn {{id}} — đã sử dụng {{min}} phút, trung bình {{avg}} phút",
"spikeAlert": "Lượng đơn tăng đột biến — kiểm tra năng lực bếp",
"reservations": "Đặt bàn hôm nay",
"addReservation": "Thêm đặt bàn",
"guestName": "Tên khách",
"partySize": "Số khách",
"reservationTime": "Giờ đặt",
"peakForecast": "Dự kiến đông khách lúc 18:30–20:00 dựa trên lịch sử đặt bàn",
"reservationAdded": "Đã thêm đặt bàn"
```
- [ ] Add same keys to en:
```json
"tableAiInsight": "Table {{id}} — occupied {{min}} min, avg {{avg}} min",
"spikeAlert": "Order spike detected — check kitchen capacity",
"reservations": "Today's Reservations",
"addReservation": "Add Reservation",
"guestName": "Guest Name",
"partySize": "Party Size",
"reservationTime": "Time",
"peakForecast": "Peak expected 18:30–20:00 based on booking history",
"reservationAdded": "Reservation added"
```
- [ ] Add to `"boh"` namespace in vi:
```json
"kanban": {
  "pending": "Đang chờ",
  "inKitchen": "Đang làm",
  "completed": "Hoàn thành"
},
"delayAlert": "Đơn bàn {{table}} chờ >20 phút",
"shiftTime": "{{start}} – {{end}}",
"shiftStatus": { "on": "Đang ca", "off": "Nghỉ" },
"laborAiForecast": "Ca 18:00–21:00 có thể thiếu nhân sự dựa trên lịch sử cuối tuần",
"supply": "Giám sát nhà cung cấp",
"supplier": "Nhà cung cấp",
"items": "Hàng cung cấp",
"lastDelivery": "Giao hàng gần nhất",
"reliability": "Đúng hạn",
"supplyAiForecast": "Thịt bò dự kiến hết trong 1.5 ngày — đặt hàng trước thứ Tư",
"channels": "Doanh thu theo kênh",
"channelName": "Kênh",
"channelOrders": "Đơn",
"channelRevenue": "Doanh thu",
"channelAiInsight": "GrabFood chiếm 38% doanh thu nhưng biên lợi nhuận thấp hơn 12% so với tại bàn"
```
- [ ] Add same keys to en (boh namespace):
```json
"kanban": {
  "pending": "Pending",
  "inKitchen": "In Kitchen",
  "completed": "Completed"
},
"delayAlert": "Table {{table}} order waiting >20 min",
"shiftTime": "{{start}} – {{end}}",
"shiftStatus": { "on": "On Shift", "off": "Off" },
"laborAiForecast": "18:00–21:00 shift may be understaffed based on weekend history",
"supply": "Supply Monitoring",
"supplier": "Supplier",
"items": "Items Supplied",
"lastDelivery": "Last Delivery",
"reliability": "On-Time",
"supplyAiForecast": "Beef projected to run out in 1.5 days — order before Wednesday",
"channels": "Revenue by Channel",
"channelName": "Channel",
"channelOrders": "Orders",
"channelRevenue": "Revenue",
"channelAiInsight": "GrabFood accounts for 38% of revenue but margin is 12% lower than dine-in"
```
- [ ] Add to `"guest"` namespace in vi:
```json
"addReservation": "Thêm đặt bàn",
"guestNameLabel": "Tên khách",
"partySizeLabel": "Số khách",
"timeLabel": "Giờ đặt (HH:MM)",
"peakForecast": "Dự kiến đông khách lúc 18:30–20:00 dựa trên lịch sử đặt bàn",
"loyaltyPoints": "Điểm",
"loyaltyTier": "Hạng",
"loyaltyTiers": { "dong": "Đồng", "bac": "Bạc", "vang": "Vàng" },
"totalMembers": "Tổng thành viên: {{count}}",
"atRiskInsight": "32% khách hàng chưa quay lại sau 14 ngày — cần chiến lược giữ chân"
```
- [ ] Add same keys to en (guest namespace):
```json
"addReservation": "Add Reservation",
"guestNameLabel": "Guest Name",
"partySizeLabel": "Party Size",
"timeLabel": "Time (HH:MM)",
"peakForecast": "Peak expected 18:30–20:00 based on booking history",
"loyaltyPoints": "Points",
"loyaltyTier": "Tier",
"loyaltyTiers": { "dong": "Bronze", "bac": "Silver", "vang": "Gold" },
"totalMembers": "Total members: {{count}}",
"atRiskInsight": "32% of guests haven't returned in 14 days — retention strategy needed"
```
- [ ] Add to `"dashboard"` namespace in vi:
```json
"aiSummary": "Tóm tắt AI hôm nay",
"rootCause": "Nguyên nhân gốc: Doanh thu giảm do Bàn 5 và Bàn 7 chờ >25 phút trong giờ cao điểm"
```
- [ ] Add same keys to en:
```json
"aiSummary": "AI Daily Summary",
"rootCause": "Root cause: Revenue dip linked to tables 5 & 7 waiting >25 min during peak hours"
```

---

### Task 2: Dashboard — AI daily summary + root cause insight

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] After the KPI cards grid and before the table grid, add a new section:

```jsx
{/* AI Daily Summary */}
<div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
  <p className="mb-1 text-sm font-semibold text-purple-700">{t('dashboard.aiSummary')}</p>
  <p className="text-sm text-gray-700">
    {i18n.language === 'vi'
      ? `Hôm nay có ${covers} lượt khách, doanh thu ${formatVnd(todayRevenue, i18n.language)}. ${occupied > 0 ? `Hiện có ${occupied} bàn đang sử dụng.` : 'Hiện không có bàn nào đang sử dụng.'} ${activeInsights.length > 0 ? `Có ${activeInsights.length} cảnh báo cần xử lý.` : 'Không có cảnh báo nào.'}`
      : `Today: ${covers} covers, revenue ${formatVnd(todayRevenue, i18n.language)}. ${occupied > 0 ? `${occupied} tables currently occupied.` : 'No tables currently occupied.'} ${activeInsights.length > 0 ? `${activeInsights.length} alert(s) need attention.` : 'No active alerts.'}`
    }
  </p>
  <p className="mt-2 text-xs text-purple-600">{t('dashboard.rootCause')}</p>
</div>
```

---

### Task 3: FrontOfHouse — Table AI insight badge + spike detection

**Files:**
- Modify: `src/pages/FrontOfHouse.jsx`

- [ ] Add local sample `tableMinutes` map at the top of the component (after state declarations):
```js
const TABLE_MINUTES = { T01: 42, T02: 18, T03: 65, T04: 10, T05: 30, T06: 55, T07: 8, T08: 22 }
const AVG_OCCUPIED_MIN = 28
```

- [ ] In the table grid buttons, after the status line, add a conditional badge for dining tables:
```jsx
{tb.status === 'dining' && TABLE_MINUTES[tb.table_id] && (
  <div className={
    'mt-1 rounded text-xs px-1 ' +
    (TABLE_MINUTES[tb.table_id] > AVG_OCCUPIED_MIN ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
  }>
    {TABLE_MINUTES[tb.table_id]}m
  </div>
)}
```

- [ ] Add spike detection: track a local `recentOrderTimes` ref and show alert when >3 orders in 5 min. After the `orders` state, add:
```js
const [spikeAlert, setSpikeAlert] = useState(false)
```
- [ ] In the `handleCreateOrder` success path, after `setCart({})`, add spike check:
```js
const now = Date.now()
const recent = orders
  .filter(o => o.created_at)
  .map(o => (o.created_at.toMillis ? o.created_at.toMillis() : new Date(o.created_at).getTime()))
  .filter(ts => now - ts < 5 * 60 * 1000)
if (recent.length >= 3) setSpikeAlert(true)
```
- [ ] Add spike alert banner at the top of the page, below the `<h1>`:
```jsx
{spikeAlert && (
  <div className="mb-4 flex items-center justify-between rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">
    <span>{t('foh.spikeAlert')}</span>
    <button onClick={() => setSpikeAlert(false)} className="ml-4 text-xs underline">{t('common.cancel')}</button>
  </div>
)}
```

---

### Task 4: GuestEngagement — Reservation form + AI forecast + Loyalty tiers

**Files:**
- Modify: `src/pages/GuestEngagement.jsx`

- [ ] Add local form state for new reservation:
```js
const [form, setForm] = useState({ name: '', partySize: 2, time: '18:00' })
const [formOpen, setFormOpen] = useState(false)
const [formError, setFormError] = useState(null)
const [localReservations, setLocalReservations] = useState([])
```

- [ ] Add AI peak forecast banner at the top of reservations section:
```jsx
<div className="mb-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
  {t('guest.peakForecast')}
</div>
```

- [ ] Add "Add Reservation" button and form (inline collapse):
```jsx
<div className="mb-3 flex justify-end">
  <button
    onClick={() => setFormOpen(f => !f)}
    className="rounded bg-purple-600 px-3 py-1 text-sm text-white"
  >
    {t('guest.addReservation')}
  </button>
</div>
{formOpen && (
  <div className="mb-4 rounded-lg border border-gray-200 p-3 space-y-2">
    {formError && <p className="text-xs text-red-600">{formError}</p>}
    <div className="flex gap-2">
      <input
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder={t('guest.guestNameLabel')}
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
      />
      <input
        type="number" min="1" max="20"
        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder={t('guest.partySizeLabel')}
        value={form.partySize}
        onChange={e => setForm(f => ({ ...f, partySize: Number(e.target.value) }))}
      />
      <input
        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder={t('guest.timeLabel')}
        value={form.time}
        onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
      />
    </div>
    <button
      onClick={() => {
        if (!form.name.trim()) { setFormError('Vui lòng nhập tên khách'); return }
        setLocalReservations(prev => [...prev, { id: Date.now(), guest_name: form.name, party_size: form.partySize, time: form.time, status: 'confirmed' }])
        setForm({ name: '', partySize: 2, time: '18:00' })
        setFormOpen(false)
        setFormError(null)
      }}
      className="rounded bg-purple-600 px-3 py-1 text-sm text-white"
    >
      {t('common.save')}
    </button>
  </div>
)}
```

- [ ] Merge `localReservations` into the upcoming list for display:
```js
const allUpcoming = [
  ...upcoming,
  ...localReservations.filter(r => r.status === 'confirmed')
]
```
Use `allUpcoming` in the table render.

- [ ] Add loyalty tier + points helper above the topGuests derivation:
```js
function getLoyaltyTier(visits) {
  if (visits >= 10) return 'vang'
  if (visits >= 5) return 'bac'
  return 'dong'
}
function getLoyaltyPoints(visits) { return visits * 50 }
```

- [ ] Extend loyalty table to add Points and Tier columns:
```jsx
<th className="py-1 pr-2">{t('guest.loyaltyPoints')}</th>
<th className="py-1">{t('guest.loyaltyTier')}</th>
// in each row:
<td className="py-2 pr-2">{getLoyaltyPoints(g.visits)}</td>
<td className="py-2">
  <span className={
    'rounded px-2 py-0.5 text-xs ' +
    (getLoyaltyTier(g.visits) === 'vang' ? 'bg-yellow-100 text-yellow-700' :
     getLoyaltyTier(g.visits) === 'bac' ? 'bg-gray-100 text-gray-600' :
     'bg-orange-100 text-orange-700')
  }>
    {t(`guest.loyaltyTiers.${getLoyaltyTier(g.visits)}`)}
  </span>
</td>
```

- [ ] Add total members + AI at-risk insight below the loyalty table:
```jsx
<p className="mt-2 text-sm text-gray-500">{t('guest.totalMembers', { count: topGuests.length })}</p>
<div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
  {t('guest.atRiskInsight')}
</div>
```

---

### Task 5: BackOfHouse — 3-column kanban for kitchen orders

**Files:**
- Modify: `src/pages/BackOfHouse.jsx`

- [ ] Replace the existing kitchen queue grid with a 3-column kanban. The existing `activeQueue` already separates non-ready items; add a `completedQueue`:
```js
const pendingQueue = kitchenQueue.filter(q => q.status === 'pending')
const inKitchenQueue = kitchenQueue.filter(q => q.status === 'in_progress' || q.status === 'in_kitchen')
const completedQueue = kitchenQueue.filter(q => q.status === 'ready')
```

- [ ] Replace the existing grid JSX with:
```jsx
<div className="grid grid-cols-3 gap-4">
  {[
    { label: t('boh.kanban.pending'), items: pendingQueue, color: 'border-gray-300' },
    { label: t('boh.kanban.inKitchen'), items: inKitchenQueue, color: 'border-purple-300' },
    { label: t('boh.kanban.completed'), items: completedQueue, color: 'border-green-300' },
  ].map(col => (
    <div key={col.label} className={'rounded-lg border-2 p-3 ' + col.color}>
      <p className="mb-2 text-sm font-semibold">{col.label} ({col.items.length})</p>
      <div className="space-y-2">
        {col.items.map(q => {
          const queuedAt = toDate(q.queued_at)
          const elapsedMin = queuedAt ? Math.round((Date.now() - queuedAt.getTime()) / 60000) : 0
          const delay = elapsedMin > 20 ? 'red' : elapsedMin > 10 ? 'amber' : 'green'
          return (
            <div key={q.id} className={
              'rounded border p-2 text-xs ' +
              (delay === 'red' ? 'border-red-300 bg-red-50' :
               delay === 'amber' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200')
            }>
              <p className="font-medium">{q.item_sku}</p>
              <p className="text-gray-500">{q.station}</p>
              <p className={delay === 'red' ? 'text-red-600 font-medium' : 'text-gray-500'}>
                {t('boh.elapsedMin', { min: elapsedMin })}
              </p>
            </div>
          )
        })}
        {col.items.length === 0 && <p className="text-xs text-gray-400">—</p>}
      </div>
    </div>
  ))}
</div>
```

---

### Task 6: BackOfHouse — Labor shift times + AI forecast

**Files:**
- Modify: `src/pages/BackOfHouse.jsx`

- [ ] Extend the staff list `<li>` to show shift start/end:
```jsx
<li key={s.staff_id} className="flex justify-between border-b border-gray-100 py-1">
  <span>
    {s.name} · {s.role}
    {s.shift_start && s.shift_end && (
      <span className="ml-2 text-gray-400">
        {formatTime(toDate(s.shift_start), i18n.language)}–{formatTime(toDate(s.shift_end), i18n.language)}
      </span>
    )}
  </span>
  <span className={
    'text-xs rounded px-2 py-0.5 ' +
    (onShiftNow.some(o => o.staff_id === s.staff_id) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')
  }>
    {onShiftNow.some(o => o.staff_id === s.staff_id) ? t('boh.shiftStatus.on') : t('boh.shiftStatus.off')}
  </span>
</li>
```

- [ ] Add AI forecast warning after the staff list:
```jsx
<div className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-700">
  {t('boh.laborAiForecast')}
</div>
```

---

### Task 7: BackOfHouse — Supply Monitoring section (local useState)

**Files:**
- Modify: `src/pages/BackOfHouse.jsx`

- [ ] Add local sample data state at the top of the component:
```js
const [suppliers] = useState([
  { id: 1, name: 'Chị Lan — Chợ Hôm', items: 'Thịt bò, Xương heo', lastDelivery: '2026-06-24', reliability: 95 },
  { id: 2, name: 'Anh Tuấn — Chợ Đồng Xuân', items: 'Rau, Hành lá, Gia vị', lastDelivery: '2026-06-23', reliability: 82 },
  { id: 3, name: 'Cty Minh Tâm', items: 'Bánh phở, Bún', lastDelivery: '2026-06-22', reliability: 68 },
])
```

- [ ] Add Supply Monitoring section after the Profit Snapshot section:
```jsx
<section>
  <h2 className="mb-2 text-lg font-semibold">{t('boh.supply')}</h2>
  <div className="mb-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
    {t('boh.supplyAiForecast')}
  </div>
  <table className="w-full text-left text-sm">
    <thead>
      <tr className="border-b border-gray-200 text-gray-500">
        <th className="py-1 pr-2">{t('boh.supplier')}</th>
        <th className="py-1 pr-2">{t('boh.items')}</th>
        <th className="py-1 pr-2">{t('boh.lastDelivery')}</th>
        <th className="py-1">{t('boh.reliability')}</th>
      </tr>
    </thead>
    <tbody>
      {suppliers.map(s => (
        <tr key={s.id} className="border-b border-gray-100">
          <td className="py-2 pr-2 font-medium">{s.name}</td>
          <td className="py-2 pr-2 text-gray-500">{s.items}</td>
          <td className="py-2 pr-2 text-gray-500">{s.lastDelivery}</td>
          <td className="py-2">
            <span className={
              'rounded px-2 py-0.5 text-xs font-medium ' +
              (s.reliability >= 90 ? 'bg-green-100 text-green-700' :
               s.reliability >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')
            }>
              {s.reliability}%
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
```

---

### Task 8: BackOfHouse — Online Ordering channel breakdown (local useState + Recharts)

**Files:**
- Modify: `src/pages/BackOfHouse.jsx`

- [ ] Add channel sample data state:
```js
const [channels] = useState([
  { name_vi: 'Tại bàn', name_en: 'Dine-in', orders: 48, revenue: 6240000 },
  { name_vi: 'Mang về', name_en: 'Takeaway', orders: 15, revenue: 1350000 },
  { name_vi: 'GrabFood', name_en: 'GrabFood', orders: 22, revenue: 2090000 },
  { name_vi: 'ShopeeFood', name_en: 'ShopeeFood', orders: 9, revenue: 855000 },
])
```

- [ ] Add import at top of file: `import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'`

- [ ] Add Online Ordering section before Supply Monitoring:
```jsx
<section>
  <h2 className="mb-2 text-lg font-semibold">{t('boh.channels')}</h2>
  <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
    {t('boh.channelAiInsight')}
  </div>
  <ResponsiveContainer width="100%" height={180}>
    <BarChart data={channels.map(c => ({ name: i18n.language === 'vi' ? c.name_vi : c.name_en, revenue: c.revenue, orders: c.orders }))}>
      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip formatter={(v, n) => n === 'revenue' ? formatVnd(v, i18n.language) : v} />
      <Bar dataKey="revenue" fill="#9333ea" radius={[4,4,0,0]} />
    </BarChart>
  </ResponsiveContainer>
  <table className="mt-3 w-full text-left text-sm">
    <thead>
      <tr className="border-b border-gray-200 text-gray-500">
        <th className="py-1 pr-2">{t('boh.channelName')}</th>
        <th className="py-1 pr-2">{t('boh.channelOrders')}</th>
        <th className="py-1">{t('boh.channelRevenue')}</th>
      </tr>
    </thead>
    <tbody>
      {channels.map(c => (
        <tr key={c.name_en} className="border-b border-gray-100">
          <td className="py-2 pr-2">{i18n.language === 'vi' ? c.name_vi : c.name_en}</td>
          <td className="py-2 pr-2">{c.orders}</td>
          <td className="py-2">{formatVnd(c.revenue, i18n.language)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</section>
```

---

## Self-Review Checklist

- [x] POS spike detection → Task 3
- [x] Inventory manual update → not added (backend-only; no API endpoint exposed to FE, skip per constraint)
- [x] Table AI insight badge → Task 3
- [x] Reservation form + AI forecast → Task 4
- [x] Order tracking kanban → Task 5
- [x] Labor shift times + AI forecast → Task 6
- [x] Loyalty tiers + points + at-risk insight → Task 4
- [x] Online Ordering channel section → Task 8
- [x] Supply Monitoring → Task 7
- [x] Dashboard AI summary + root cause → Task 2
- [x] All new strings bilingual → Task 1
- [x] No new npm packages (Recharts already installed)
- [x] No React Router changes
- [x] No existing data deleted
