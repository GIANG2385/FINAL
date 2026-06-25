# FOH/BOH Order Flow Redesign — Design Spec
Date: 2026-06-25

## Overview

Overhaul the Front-of-House (FOH) and Back-of-House (BOH) pages to tighten the full table lifecycle, enforce kitchen readiness before serving, add VNPay QR payment, link reservations to tables, and move all state to Firestore.

---

## 1. Table State Machine

**States:** `open` → `reserved` → `dining` → `cleanup` → `open`

- `open`: available, no active order
- `reserved`: a confirmed reservation is within ±10 min of its scheduled time and a table has been assigned
- `dining`: order created and table occupied
- `cleanup`: payment recorded, awaiting reset
- Back to `open`: staff presses "Mark Clean / Open Table" button

The table card in the grid shows the guest name when status is `reserved`.

---

## 2. Reservation → Table Linking

**Firestore `reservations` doc fields (additions):**
```
table_id: string | null      // assigned by staff
note: string | null          // optional staff note
```

**Assignment:** In the Reservations tab, each confirmed reservation row has:
- A table dropdown (lists tables currently with status `open`) to assign a table
- An "Add Note" button that opens an inline text input; saving writes `note` to Firestore
- Saving the table assignment writes `table_id` to the reservation doc in Firestore

**Auto-reserve logic (client-side, 1-min interval):**
- For each `confirmed` reservation where `table_id` is set:
  - If `now` is within the window `[reservation_time - 10min, reservation_time + 10min]`, set that table's `status` to `reserved` in Firestore
  - If the window has passed (now > reservation_time + 10min) and table is still `reserved`, set it back to `open`

**All reservations stored in Firestore** — remove local `localReservations` React state entirely.

---

## 3. Continue Ordering Before Charge

When an order is `served` but not yet paid, the payment panel shows two buttons:
- **Record Payment** (existing)
- **Add More Items** — appends new items to the existing order doc, recalculates `total_amount`, sets order status back to `open`. Table stays `dining`. No new order doc is created.

---

## 4. Kitchen Must Be Ready Before Mark Served

- Order status `in_kitchen`: show kitchen banner, Mark Served button is **disabled** with label "Waiting for kitchen…"
- Order status `ready` (all kitchen queue items marked ready): Mark Served button is **enabled**
- No change to `handleAdvanceQueueItem` logic — the `ready` promotion already works correctly

---

## 5. Payment Methods: Cash + VNPay Only

Remove `card` and `momo`. New list: `['cash', 'vnpay']`.

**Cash:** records immediately as before.

**VNPay QR flow:**
1. Staff taps "VNPay" → FOH calls `POST /api/vnpay/create-payment-url` with `{ orderId, amount }`
2. Backend builds and HMAC-SHA512 signs the VNPay redirect URL using `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET`
3. Backend returns the signed URL
4. Frontend renders it as a QR code using `qrcode.react` (no external service)
5. Customer scans on phone → pays via VNPay sandbox
6. VNPay redirects customer browser to `https://final-wine-five.vercel.app/vnpay-return?...`
7. That route calls `GET /api/vnpay/verify-return` — backend re-hashes params and compares signature
8. On success: FOH staff taps "Confirm received" → writes `payment_method: 'vnpay'` to Firestore, table moves to `cleanup`

**Backend env (sandbox):**
```env
VNPAY_TMN_CODE=DEMOV210
VNPAY_HASH_SECRET=RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ
VNPAY_SANDBOX_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://final-wine-five.vercel.app/vnpay-return
```
Replace with real credentials for production. The hash secret is never sent to the frontend.

**New frontend route:** `src/pages/VnpayReturn.jsx` — reads query params from VNPay, calls verify endpoint, shows success/failure screen.

**New backend routes:**
- `POST /api/vnpay/create-payment-url`
- `GET /api/vnpay/verify-return`

---

## 6. Cleanup → Open Button

When a table is in `cleanup` status, the order panel shows:
- "Mark Clean / Open Table" button → sets `status: 'open'`, clears `seated_at: null` in Firestore

---

## 7. All Data in Firestore + Dashboard

- All reservation writes go directly to Firestore (no local state)
- `note` and `table_id` on reservations are Firestore fields
- VNPay `payment_method` value flows into existing Dashboard revenue aggregation automatically
- Cleanup → open transitions update the `tables` collection in real-time
- Dashboard reads `orders` and `tables` via existing `onSnapshot` listeners — no Dashboard changes needed

---

## 8. BOH: Remove Kitchen Tab

- Remove the `kitchen` tab from BOH tabs array
- Remove the kitchen kanban render block from BOH JSX
- Remove `kitchenQueue` state and its `onSnapshot` subscription from BOH
- Kitchen kanban lives exclusively in FOH → Orders tab
- BOH retains: Inventory, Labor, Supply & Revenue

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/FrontOfHouse.jsx` | All FOH changes (items 1–7) |
| `frontend/src/pages/BackOfHouse.jsx` | Remove kitchen tab (item 8) |
| `frontend/src/pages/VnpayReturn.jsx` | New — VNPay return handler page |
| `frontend/src/App.jsx` | Add `/vnpay-return` route |
| `backend/src/routes/vnpay.js` | New — create-payment-url + verify-return |
| `backend/src/server.js` | Mount `/api/vnpay` router |
| `backend/.env` | Add VNPAY_* env vars |

---

## Data Model Changes

**`reservations` collection** — add fields:
```
table_id: string | null
note: string | null
```

No schema changes to `orders`, `tables`, or `kitchen_queue`.
