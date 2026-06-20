# Front of House & Dashboard Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Front of House order panel read clearly as a point-of-sale bill with an explicit payment-confirmation step, and give the Dashboard's revenue KPI a Today/7 Days/Month range toggle compared against the historical baseline.

**Architecture:** Both changes are frontend-only. FOH gains local component state (`paymentConfirmation`) to show a confirmation screen after a successful payment write, plus visual/i18n changes to the existing bill panel — no new Firestore fields or backend calls. Dashboard gains a `range` state that drives a `GET /api/profit/summary?range=...` fetch (the endpoint already supports `day`/`week`/`month` and returns `historical_avg_revenue`), rendered in the existing Revenue KPI card with a percent-vs-typical comparison line.

**Tech Stack:** React + Vite, react-i18next, Tailwind, Firebase Web SDK (`onSnapshot`), the existing `api` fetch wrapper (`frontend/src/services/api.js`).

## Global Constraints

- No backend changes — `GET /api/profit/summary?range=day|week|month` already returns `{ range, revenue, food_cost, labor_cost, profit, historical_avg_revenue }` (verified working as of the historical-baseline work).
- This project has no automated test framework. Verification = `npm run build` succeeds, plus a live Playwright-driven browser check against the real dev servers and real Firestore project (the established convention used for every prior feature in this codebase).
- Covers, Avg Ticket, and Table Occupancy KPI cards stay today-only/live — only the Revenue card gets the range toggle.
- FOH's table grid stays on top, order panel stays below — no layout restructuring, only clarity changes to the existing panel.
- Payment methods (cash/card/momo) and the existing `payment_method` Firestore write / table-status-to-`cleanup` flip are unchanged.
- All new user-facing strings must have both `en` and `vi` i18n keys — this codebase has full bilingual coverage with no exceptions (see Step 11 polish-pass history in `PROGRESS.md`).

---

### Task 1: i18n keys for both pages

**Files:**
- Modify: `frontend/src/locales/en/translation.json`
- Modify: `frontend/src/locales/vi/translation.json`

**Interfaces:**
- Produces: the following translation keys, consumed by Tasks 2 and 3:
  - `dashboard.range.day`, `dashboard.range.week`, `dashboard.range.month`
  - `dashboard.vsTypical` (interpolated template with a `{{pct}}` variable)
  - `foh.billFor` (interpolated template with a `{{table}}` variable)
  - `foh.orderStatus.open`, `foh.orderStatus.in_kitchen`, `foh.orderStatus.served`
  - `foh.paymentReceived`
  - `foh.startNewOrder`

- [ ] **Step 1: Add the new keys to `frontend/src/locales/en/translation.json`**

Modify the `dashboard` block (currently lines 30-44) to add a `range` sub-object and `vsTypical` key. The full updated block:

```json
  "dashboard": {
    "todayRevenue": "Today's Revenue",
    "covers": "Covers",
    "avgTicket": "Avg Ticket",
    "tableOccupancy": "Table Occupancy",
    "tablesOccupied": "{{occupied}} / {{total}} occupied",
    "alerts": "Active Alerts",
    "noAlerts": "No active alerts.",
    "range": {
      "day": "Today",
      "week": "7 Days",
      "month": "Month"
    },
    "vsTypical": "{{pct}}% vs typical",
    "status": {
      "open": "Open",
      "reserved": "Reserved",
      "dining": "Dining",
      "cleanup": "Cleanup"
    }
  },
```

Modify the `foh` block (currently lines 45-52) to add the new keys. The full updated block:

```json
  "foh": {
    "createOrder": "Create Order",
    "total": "Total",
    "sendToKitchen": "Send to Kitchen",
    "inKitchen": "In kitchen...",
    "markServed": "Mark Served",
    "recordPayment": "Record Payment",
    "billFor": "Bill — {{table}}",
    "orderStatus": {
      "open": "Open",
      "in_kitchen": "In Kitchen",
      "served": "Served"
    },
    "paymentReceived": "Payment received",
    "startNewOrder": "Start New Order"
  },
```

- [ ] **Step 2: Add the matching keys to `frontend/src/locales/vi/translation.json`**

Read the file first to confirm the exact current structure of its `dashboard` and `foh` blocks (the Vietnamese file mirrors the English one key-for-key but the surrounding key ordering/values must be read directly — do not guess Vietnamese phrasing without seeing the existing style in this file). Add the equivalent keys with natural Vietnamese restaurant-ops phrasing, matching the tone of existing `foh.*`/`dashboard.*` Vietnamese strings already in the file:
- `dashboard.range.day` / `.week` / `.month` → Vietnamese for "Hôm nay" / "7 Ngày" / "Tháng này" (adjust to match existing terminology used elsewhere in the file for "today"/time ranges, e.g. check `boh.recentOrders` or similar for house style)
- `dashboard.vsTypical` → a Vietnamese template using `{{pct}}`, meaning "{{pct}}% so với mức trung bình" (so với = compared to, mức trung bình = average/typical level)
- `foh.billFor` → Vietnamese template using `{{table}}`, meaning "Hóa đơn — {{table}}" (hóa đơn = bill/invoice)
- `foh.orderStatus.open` / `.in_kitchen` / `.served` → Vietnamese for "Mở" / "Đang chế biến" / "Đã phục vụ" (check existing `foh.inKitchen` value "Đang chế biến..." or similar in the file for consistency, reuse the same root phrase without the ellipsis)
- `foh.paymentReceived` → Vietnamese for "Đã nhận thanh toán" (received payment)
- `foh.startNewOrder` → Vietnamese for "Bắt đầu đơn mới" (start new order)

- [ ] **Step 3: Verify both files are valid JSON**

```bash
cd "frontend" && node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json')); JSON.parse(require('fs').readFileSync('src/locales/vi/translation.json')); console.log('both valid')"
```

Expected: `both valid`

- [ ] **Step 4: Verify the frontend still builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built in <N>ms` with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/locales/en/translation.json frontend/src/locales/vi/translation.json
git commit -m "Add i18n keys for FOH bill clarity and Dashboard revenue range KPI"
```

---

### Task 2: Dashboard revenue range toggle

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `api.get(path)` from `frontend/src/services/api.js` (returns a parsed JSON promise, throws on non-2xx); `GET /api/profit/summary?range=day|week|month` returns `{ range, revenue, food_cost, labor_cost, profit, historical_avg_revenue }`; i18n keys from Task 1 (`dashboard.range.day/week/month`, `dashboard.vsTypical`).
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Add range state and a fetch effect**

In `frontend/src/pages/Dashboard.jsx`, add `useState` for the selected range, the fetched profit summary, and a per-section error — following the same per-section error pattern already used in `BackOfHouse.jsx` (`inventoryError`/`profitError`, lines 28/33 of that file) so a failed fetch here doesn't block the rest of the Dashboard.

Locate the existing state declarations (currently lines 26-29):

```jsx
  const [orders, setOrders] = useState(null)
  const [tables, setTables] = useState(null)
  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
```

Replace with:

```jsx
  const [orders, setOrders] = useState(null)
  const [tables, setTables] = useState(null)
  const [insights, setInsights] = useState([])
  const [ackError, setAckError] = useState(null)
  const [revenueRange, setRevenueRange] = useState('day')
  const [revenueSummary, setRevenueSummary] = useState(null)
  const [revenueError, setRevenueError] = useState(null)
```

Locate the existing `useEffect` for `onSnapshot` listeners (currently lines 31-46, ending with `}, [])`). Immediately after that `useEffect` block, add a new effect that fetches the profit summary whenever `revenueRange` changes:

```jsx
  useEffect(() => {
    setRevenueError(null)
    api
      .get(`/api/profit/summary?range=${revenueRange}`)
      .then(setRevenueSummary)
      .catch(() => setRevenueError(t('common.error')))
  }, [revenueRange, t])
```

- [ ] **Step 2: Compute the vs-typical percentage**

Locate the existing derived-value block (currently lines 57-65, the `servedToday`/`todayRevenue`/`covers`/`avgTicket`/`occupied`/`activeInsights` calculations). Immediately after the `activeInsights` line, add:

```jsx
  const vsTypicalPct =
    revenueSummary && revenueSummary.historical_avg_revenue > 0
      ? Math.round(
          ((revenueSummary.revenue - revenueSummary.historical_avg_revenue) /
            revenueSummary.historical_avg_revenue) *
            100
        )
      : null
```

- [ ] **Step 3: Replace the Revenue KPI card with the interactive version**

Locate the existing first KPI card (currently lines 80-83):

```jsx
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t('dashboard.todayRevenue')}</p>
          <p className="mt-1 text-xl font-semibold">{formatVnd(todayRevenue, i18n.language)}</p>
        </div>
```

Replace it with:

```jsx
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-2 flex gap-1">
            {['day', 'week', 'month'].map((r) => (
              <button
                key={r}
                onClick={() => setRevenueRange(r)}
                className={
                  'rounded px-2 py-0.5 text-xs ' +
                  (revenueRange === r ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600')
                }
              >
                {t(`dashboard.range.${r}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500">{t('dashboard.todayRevenue')}</p>
          {revenueError ? (
            <p className="mt-1 text-sm text-red-600">{revenueError}</p>
          ) : revenueSummary ? (
            <>
              <p className="mt-1 text-xl font-semibold">{formatVnd(revenueSummary.revenue, i18n.language)}</p>
              {vsTypicalPct !== null && (
                <p className={'mt-1 text-xs ' + (vsTypicalPct >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {t('dashboard.vsTypical', { pct: vsTypicalPct >= 0 ? `+${vsTypicalPct}` : vsTypicalPct })}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xl font-semibold">{formatVnd(todayRevenue, i18n.language)}</p>
          )}
        </div>
```

Note: the fallback to `todayRevenue` (the existing client-computed today-only figure) while `revenueSummary` hasn't loaded yet avoids a flash of empty content, and matches the existing `todayRevenue` variable that's still used elsewhere — it is NOT removed by this task, only the Covers/Avg Ticket cards below still reference it (see Global Constraints — those stay unchanged).

- [ ] **Step 4: Verify the frontend builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built in <N>ms` with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "Add revenue range toggle with historical comparison to Dashboard"
```

---

### Task 3: FOH bill styling + status badge

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: i18n keys from Task 1 (`foh.billFor`, `foh.orderStatus.open/in_kitchen/served`).
- Produces: no new exports — this is a leaf page component. (Task 4 builds on the same file for the payment-confirmation step.)

- [ ] **Step 1: Add a status badge color map**

Locate the existing `TABLE_COLORS` constant (currently lines 15-20). Immediately after it, add:

```jsx
const ORDER_STATUS_COLORS = {
  open: 'bg-gray-100 text-gray-600',
  in_kitchen: 'bg-purple-100 text-purple-700',
  served: 'bg-green-100 text-green-700',
}
```

- [ ] **Step 2: Replace the panel heading and add the status badge**

Locate the existing panel heading (currently lines 145-147):

```jsx
        <div className="mt-6 max-w-md rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">{selectedTable}</h2>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
```

Replace with:

```jsx
        <div className="mt-6 max-w-md rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {activeOrder ? t('foh.billFor', { table: selectedTable }) : selectedTable}
            </h2>
            {activeOrder && (
              <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + ORDER_STATUS_COLORS[activeOrder.status]}>
                {t(`foh.orderStatus.${activeOrder.status}`)}
              </span>
            )}
          </div>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
```

Note: `activeOrder.status` is one of `'open' | 'in_kitchen' | 'served'` (set by the backend's `PATCH /api/orders/:id/status`, see `backend/src/controllers/ordersController.js`), matching the three `ORDER_STATUS_COLORS`/`foh.orderStatus.*` keys exactly.

- [ ] **Step 3: Strengthen the bill total's visual weight**

Locate the existing total row inside the `activeOrder` block (currently lines 199-202):

```jsx
              <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
                <span>{t('foh.total')}</span>
                <span>{formatVnd(activeOrder.total_amount, i18n.language)}</span>
              </div>
```

Replace with:

```jsx
              <div className="flex justify-between border-t-2 border-gray-400 pt-2 text-base font-semibold">
                <span>{t('foh.total')}</span>
                <span>{formatVnd(activeOrder.total_amount, i18n.language)}</span>
              </div>
```

- [ ] **Step 4: Verify the frontend builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built in <N>ms` with no errors. (The status badge won't be visually exercised until Task 4/5's live check, since it requires an active order — this step only confirms no syntax/import errors.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "Restyle FOH order panel as a clear bill with status badge"
```

---

### Task 4: FOH payment confirmation step

**Files:**
- Modify: `frontend/src/pages/FrontOfHouse.jsx`

**Interfaces:**
- Consumes: i18n keys from Task 1 (`foh.paymentReceived`, `foh.startNewOrder`); the existing `handleRecordPayment(orderId, method)` function and `activeOrder` value (both already present in this file, extended by Task 3's status badge work but not changed in shape).
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Add payment-confirmation state**

Locate the existing state declarations (currently lines 26-31):

```jsx
  const [tables, setTables] = useState(null)
  const [orders, setOrders] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
```

Replace with:

```jsx
  const [tables, setTables] = useState(null)
  const [orders, setOrders] = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [paymentConfirmation, setPaymentConfirmation] = useState(null)
```

- [ ] **Step 2: Clear confirmation state when switching tables**

Locate the table-grid button's `onClick` (currently line 131):

```jsx
            onClick={() => setSelectedTable(tb.table_id)}
```

Replace with:

```jsx
            onClick={() => {
              setSelectedTable(tb.table_id)
              setPaymentConfirmation(null)
            }}
```

- [ ] **Step 3: Set confirmation state on successful payment**

Locate the existing `handleRecordPayment` function (currently lines 110-121):

```jsx
  async function handleRecordPayment(orderId, method) {
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'orders', orderId), { payment_method: method })
      await updateDoc(doc(db, 'tables', selectedTable), { status: 'cleanup' })
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }
```

Replace with:

```jsx
  async function handleRecordPayment(orderId, method, total) {
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'orders', orderId), { payment_method: method })
      await updateDoc(doc(db, 'tables', selectedTable), { status: 'cleanup' })
      setPaymentConfirmation({ tableId: selectedTable, total, method })
    } catch (err) {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }
```

- [ ] **Step 4: Pass the order total through to the payment handler**

Locate the existing payment-method buttons (currently lines 227-243):

```jsx
              {activeOrder.status === 'served' && !activeOrder.payment_method && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('foh.recordPayment')}</p>
                  <div className="flex gap-2">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        disabled={busy}
                        onClick={() => handleRecordPayment(activeOrder.id, method)}
                        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm capitalize disabled:opacity-50"
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              )}
```

Replace the `onClick` line with:

```jsx
                        onClick={() => handleRecordPayment(activeOrder.id, method, activeOrder.total_amount)}
```

(Only that one line changes — the rest of the block is unchanged.)

- [ ] **Step 5: Render the confirmation view, ahead of the bill/new-order views**

Locate the conditional rendering structure inside the `selectedTable &&` block. Currently the panel body is, in order: the heading/badge block (from Task 3), the error message, then `{!activeOrder && (...)}` (the menu picker) and `{activeOrder && (...)}` (the bill). Find the error-message line:

```jsx
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
```

Immediately after it, add a new conditional block that takes precedence — when `paymentConfirmation` is set and matches the current table, render the confirmation view instead of the menu picker or bill:

```jsx
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {paymentConfirmation && paymentConfirmation.tableId === selectedTable ? (
            <div className="space-y-3 text-center">
              <p className="text-lg font-semibold text-green-700">{t('foh.paymentReceived')}</p>
              <p className="text-2xl font-bold">{formatVnd(paymentConfirmation.total, i18n.language)}</p>
              <p className="text-sm capitalize text-gray-500">{paymentConfirmation.method}</p>
              <button
                onClick={() => setPaymentConfirmation(null)}
                className="w-full rounded bg-purple-600 px-4 py-2 text-sm text-white"
              >
                {t('foh.startNewOrder')}
              </button>
            </div>
          ) : (
            <>
```

Then locate the closing of the existing `{activeOrder && (...)}` block — it currently ends with:

```jsx
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

(This is the closing `</div>` of the `activeOrder` block, its `)}`, the closing `</div>` of the `selectedTable &&` panel, its `)}`, then the closing `</div>` of the top-level return and the component.)

Change it to close the new fragment wrapper added in Step 5 before the panel's closing `</div>`:

```jsx
            </div>
          )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

Run a formatter/linter mentally here: the `<>`/`</>` fragment wraps both the `{!activeOrder && (...)}` and `{activeOrder && (...)}` blocks as siblings inside the ternary's `else` branch — indentation shown above is illustrative; preserve valid JSX nesting (the fragment must wrap exactly the two existing conditional blocks, no more, no less).

- [ ] **Step 6: Verify the frontend builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built in <N>ms` with no errors. If there's a JSX syntax error from the fragment restructuring in Step 5, fix the nesting (this is the riskiest step in this task — read the surrounding braces carefully before concluding the fix is correct).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/FrontOfHouse.jsx
git commit -m "Add payment confirmation step to FOH"
```

---

### Task 5: End-to-end browser verification

**Files:** none (verification only — no new files)

**Interfaces:** none (this task only exercises the system built in Tasks 1-4)

- [ ] **Step 1: Restart both dev servers cleanly**

```bash
pkill -f vite 2>/dev/null; pkill -f "node src/server.js" 2>/dev/null; pkill -f "nodemon src/server.js" 2>/dev/null
sleep 1
cd "backend" && (npm run dev > /tmp/backend_dev.log 2>&1 &)
sleep 2 && curl -s http://localhost:4000/api/health; echo
cd "../frontend" && (npm run dev > /tmp/frontend_dev.log 2>&1 &)
sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `{"status":"ok"}` then `200`.

- [ ] **Step 2: Write a Playwright script to drive the full flow**

Create `/tmp/demo-foh-dashboard.mjs`:

```js
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto('http://localhost:5173/login')
await page.waitForSelector('input[type="email"]')
await page.fill('input[type="email"]', 'hgiang2308@gmail.com')
await page.fill('input[type="password"]', '123456')
await page.click('button[type="submit"]')
await page.waitForURL('http://localhost:5173/', { timeout: 10000 })

// --- Dashboard revenue range toggle ---
await page.goto('http://localhost:5173/')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/dashboard-01-day.png' })
const dayText = await page.textContent('body')

await page.click('text=7 Days')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/dashboard-02-week.png' })
const weekText = await page.textContent('body')

await page.click('text=Month')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/dashboard-03-month.png' })
const monthText = await page.textContent('body')

console.log('DAY/WEEK same:', dayText === weekText)
console.log('WEEK/MONTH same:', weekText === monthText)

// --- FOH full order -> payment -> confirmation flow ---
await page.goto('http://localhost:5173/foh')
await page.waitForTimeout(1000)

// Pick the first "Open" table
const openTable = page.locator('button:has-text("Open")').first()
await openTable.click()
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/foh-01-menu.png' })

// Add 1x of the first menu item (click its "+" button)
await page.locator('button:has-text("+")').first().click()
await page.waitForTimeout(300)
await page.click('text=Create Order')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/foh-02-bill-open.png' })

await page.click('text=Send to Kitchen')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/foh-03-bill-kitchen.png' })

await page.click('text=Mark Served')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/foh-04-bill-served.png' })

await page.click('text=cash')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/foh-05-confirmation.png' })

const confirmText = await page.textContent('body')
console.log('Has "Payment received":', confirmText.includes('Payment received'))

await page.click('text=Start New Order')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/foh-06-reset.png' })

console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
```

- [ ] **Step 3: Run it**

```bash
cd /tmp && node demo-foh-dashboard.mjs 2>&1
```

Expected: `ERRORS: []`, `DAY/WEEK same: false`, `WEEK/MONTH same: false` (the revenue figures should differ across ranges — if they're identical across all three, check whether the backend's `/api/profit/summary` is actually receiving distinct `range` values, or whether there isn't enough data variance across windows to produce a visible difference, before treating it as a bug), `Has "Payment received": true`.

- [ ] **Step 4: Visually confirm via the screenshots**

Read `/tmp/dashboard-01-day.png`, `/tmp/dashboard-02-week.png`, `/tmp/dashboard-03-month.png` — confirm the active range tab is visually highlighted (purple background) and the revenue figure + vs-typical line change between them.

Read `/tmp/foh-02-bill-open.png` through `/tmp/foh-05-confirmation.png` — confirm: the bill panel shows "Bill — {table}" heading with a status badge that changes color/label across Open → In Kitchen → Served; the total line has the heavier divider; the confirmation screen (`foh-05`) shows "Payment received", the correct total, and the payment method; `foh-06-reset.png` shows the panel back to a blank menu picker (not the confirmation screen) for that table.

- [ ] **Step 5: Verify switching tables clears a stale confirmation**

In the same Playwright session (extend the script before `browser.close()`, or run a follow-up script) — after the payment-confirmation step (before clicking "Start New Order"), click a different table in the grid, then click back to the original table. Confirm the original table's panel does NOT show the stale confirmation screen on return (Firestore's order/table state has already updated — clicking back to a "cleanup" status table should show that table's actual current state, not a leftover confirmation).

```js
// Append before `await browser.close()` in a copy of the script, after Step where confirmation is showing (before "Start New Order" click):
await page.click('text=T01') // pick any other visible table id from the grid screenshot
await page.waitForTimeout(500)
const otherTableText = await page.textContent('body')
console.log('Confirmation leaked to other table:', otherTableText.includes('Payment received'))
```

Expected: `Confirmation leaked to other table: false`

- [ ] **Step 6: Update `PROGRESS.md`**

Add a dated log entry to `PROGRESS.md` matching the existing style, recording: what was built (Dashboard revenue range toggle + historical comparison, FOH bill clarity + payment confirmation), and the verification results from this task (range toggle confirmed working with distinct values per range, full FOH lifecycle confirmed through to confirmation screen and reset, zero console errors, table-switch-clears-confirmation confirmed).

- [ ] **Step 7: Commit**

```bash
git add PROGRESS.md
git commit -m "Verify FOH bill clarity and Dashboard revenue range KPI end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the i18n section. Task 2 covers Dashboard's range toggle + vs-typical line + per-section error isolation. Tasks 3-4 cover FOH's bill styling, status badge, and payment confirmation (including the table-switch-clears-confirmation requirement, verified in Task 5 Step 5). Task 5 covers the spec's "Testing / Verification" section in full. No spec section is uncovered.
- **Placeholder scan:** No TBD/TODO; Task 1's Vietnamese-translation step intentionally directs the implementer to read the existing file for exact house style rather than guessing blind, since this codebase's Vietnamese phrasing conventions must be observed firsthand, not invented from outside the file — this is a sourced judgment call, not an unresolved placeholder.
- **Type consistency:** `paymentConfirmation` shape `{ tableId, total, method }` is defined in Task 4 Step 1 and used identically in Steps 3 and 5 of the same task. `ORDER_STATUS_COLORS` keys (`open`/`in_kitchen`/`served`) match `foh.orderStatus.*` i18n keys from Task 1 and the real order-status values from `ordersController.js`, used consistently in Task 3.
