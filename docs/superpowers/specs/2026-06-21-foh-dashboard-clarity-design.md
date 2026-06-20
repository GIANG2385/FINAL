# Front of House & Dashboard Clarity Improvements — Design

**Date:** 2026-06-21
**Status:** Approved

## Problem

Two existing pages communicate their purpose less clearly than they should:

- **Front of House** (`frontend/src/pages/FrontOfHouse.jsx`) already has the right operational flow (menu picker → cart → send to kitchen → mark served → record payment), but the active-order panel doesn't read like a point-of-sale bill — it's a plain list with a total appended below, and completing a payment silently resets the panel to a blank order form with no confirmation that the transaction succeeded.
- **Dashboard** (`frontend/src/pages/Dashboard.jsx`) already shows 4 KPI cards, but the revenue figure is today-only with no way to see 7-day or month-to-date totals, and it doesn't use the historical baseline (`historical_avg_revenue`) the backend's `/api/profit/summary` endpoint now returns — so there's no way to tell at a glance whether today/this week/this month is running ahead of or behind what's typical.

## Goals

- FOH's order panel reads unambiguously as a bill/receipt, with a clear, separate "payment completed" moment.
- Dashboard's revenue KPI lets the owner switch between Today / 7 Days / Month and see how that figure compares to historical norms.

## Non-Goals

- No restructuring of FOH into a two-pane POS layout (table grid stays on top, order panel stays below — this is a clarity pass on the existing layout, not a redesign).
- Covers, Avg Ticket, and Table Occupancy KPI cards stay today-only/live — they are not changed to follow the revenue range toggle (covers/avg-ticket have no backend support for week/month ranges yet, and occupancy is inherently real-time).
- No changes to the payment methods offered (cash/card/momo) or how they're recorded.

## Design

### 1. Dashboard: Revenue KPI with range toggle

The Revenue card becomes interactive:

- Three small tab buttons inside the card: **Today / 7 Days / Month** (i18n keys `dashboard.range.day` / `.week` / `.month`).
- Selecting a tab triggers `GET /api/profit/summary?range=day|week|month` (already implemented backend-side, including the `historical_avg_revenue` field added in the historical-baseline work).
- Below the revenue figure, a comparison line: `{percent}% vs typical` where `percent = round((revenue - historical_avg_revenue) / historical_avg_revenue * 100)`. Color-coded green when ≥0%, red when negative. If `historical_avg_revenue` is 0 (baseline not yet computed) or the fetch fails, the comparison line is omitted (not shown as "0%" or an error) — the revenue figure itself still renders.
- Loading/error state for this card follows the same per-section pattern already used in `BackOfHouse.jsx` (`inventoryError`/`profitError`) — a fetch failure here must not block the rest of the Dashboard (table grid, alerts) from rendering, consistent with the Step 11 polish-pass fix that made BackOfHouse sections fail independently.
- Default selected range on page load: Today (`day`).

The other 3 KPI cards (Covers, Avg Ticket, Table Occupancy) are unchanged — still computed client-side from the existing 24h-scoped `onSnapshot` orders listener, still today-only.

### 2. Front of House: Bill clarity + payment confirmation

**Bill styling** (applies to the existing active-order panel, when an order exists and is not yet in the post-payment confirmation state):
- Panel heading changes from the table ID alone to `"Bill — {tableId}"` (new i18n key `foh.billFor`, interpolated).
- A small status badge near the heading showing the order's current status: Open / In Kitchen / Served (new i18n keys `foh.orderStatus.open` / `.in_kitchen` / `.served`), styled similarly to the severity/status badges already used on the Insights page.
- Item rows and the total line keep their current data/logic, but the total row gets a clearer receipt-style treatment (top border already exists; this is a visual-only change — heavier/double border, larger font for the total amount).
- The send-to-kitchen / mark-served / payment-method buttons below remain functionally identical — only the surrounding panel framing changes.

**Payment confirmation step** (new):
- On a successful `handleRecordPayment` call, instead of letting the panel fall through to "no active order" (which currently makes it silently reappear as a blank new-order form), the component holds a new local state `paymentConfirmation = { tableId, total, method }` set right after the Firestore update succeeds.
- While `paymentConfirmation` is set and matches the currently selected table, the panel renders a confirmation view instead of the bill or the new-order form: a checkmark/"Payment received" message (new i18n key `foh.paymentReceived`), the final total, the payment method used, and a single "Start New Order" button (new i18n key `foh.startNewOrder`).
- Clicking "Start New Order" clears `paymentConfirmation`, returning the panel to the normal "no active order" state (fresh menu picker) for that table — consistent with today's table-flips-to-cleanup behavior, which is unchanged.
- Switching to a different table (selecting another table in the grid) also clears `paymentConfirmation`, so confirmation screens don't leak across tables.
- This is purely local UI state — no new Firestore fields, no backend changes. The existing `payment_method` write and table-status flip to `cleanup` are unchanged.

### Data flow

No backend changes are required for either page. Dashboard's range toggle consumes the existing `/api/profit/summary` endpoint (extended in the prior historical-baseline work) with its three already-supported `range` values. FOH's confirmation step is entirely client-side state built from data already returned by the existing payment-recording call.

### Error handling

- Dashboard: profit-summary fetch failures are caught and shown as a small inline error within the Revenue card only (matching BackOfHouse's per-section error pattern) — they do not block other Dashboard sections.
- FOH: the payment confirmation step only appears after a successful write; on failure, the existing error-banner behavior (`setError(t('common.error'))`) is unchanged and the bill view remains visible so staff can retry.

### i18n

New keys needed in both `en` and `vi` locale files:
- `dashboard.range.day`, `dashboard.range.week`, `dashboard.range.month`
- `dashboard.vsTypical` (template, e.g. `"{{pct}}% vs typical"`)
- `foh.billFor` (template, e.g. `"Bill — {{table}}"`)
- `foh.orderStatus.open`, `foh.orderStatus.in_kitchen`, `foh.orderStatus.served`
- `foh.paymentReceived`
- `foh.startNewOrder`

## Testing / Verification

This project has no automated test framework (consistent with every prior feature). Verification follows the established convention: build passes (`npm run build`), then a live Playwright-driven browser check exercising:
- Dashboard: switching all three range tabs, confirming the revenue figure and vs-typical line change correctly and match the corresponding `/api/profit/summary` response.
- FOH: full order lifecycle (create → send to kitchen → mark served → record payment) ending in the confirmation screen, then confirming "Start New Order" resets to a blank menu picker and the table grid shows the table back in `cleanup`/cycling correctly; also confirm switching tables mid-confirmation clears the confirmation state for the original table.
