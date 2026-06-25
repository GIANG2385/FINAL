# Full UI Prompt — Pang Pang SmartOps AI
# Complete visual specification including all fixes + active nav state

---

## Paste this entire prompt into Claude Code as a single session.

---

## PART 0 — Active nav item styling (new fix)

In the top navbar, the currently active nav item must be visually
distinct from inactive items. Apply this pattern:

```jsx
// In your Navbar/Nav component, for each nav link:
<button
  onClick={() => setCurrentPage(page.id)}
  style={{
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    fontWeight: currentPage === page.id ? 700 : 400,
    color: currentPage === page.id ? '#111111' : '#555555',
    borderBottom: currentPage === page.id
      ? '2px solid #7C3AED'
      : '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  }}
>
  {page.label}
</button>
```

Rules:
- Active item: font-weight 700 (bold), color #111, 2px solid purple
  (#7C3AED) underline flush with the navbar bottom border
- Inactive items: font-weight 400, color #555, no underline
- Hover on inactive: color #111, no underline (just color change)
- The underline must be flush with the bottom of the navbar — use
  borderBottom on the button itself, not a separate element
- No background color change on active — underline + bold is enough
- Transition: 0.15s ease on color and border changes

Apply this to ALL nav items:
Dashboard · Front of House · Back of House · Guest Engagement ·
Insights · AI Consultant · Settings

---

## PART 1 — Global shell (keep existing, do not rebuild)

Keep the existing horizontal top navbar. Do not add a sidebar.

Navbar layout (left to right):
- Left: "Pang Pang SmartOps AI" bold black logo text
- Center: nav items with active state as described in Part 0
- Right: [VI/EN toggle button] [admin label] [Log out button]

VI/EN toggle button in navbar:
```jsx
<button
  onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
  style={{
    padding: '4px 12px',
    borderRadius: '99px',
    border: '1px solid #e0e0e0',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    background: 'transparent',
    color: '#333',
    marginRight: '12px',
  }}
>
  {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
</button>
```

Navbar container styles:
```css
position: sticky;
top: 0;
z-index: 100;
background: white;
border-bottom: 1px solid #e5e7eb;
padding: 0 24px;
height: 52px;
display: flex;
align-items: center;
gap: 4px;
```

Page content area below navbar:
```css
padding: 28px 32px;
background: #f9fafb;
min-height: calc(100vh - 52px);
```

---

## PART 2 — Dashboard page

Page title: "Dashboard" (h1, 28px, font-weight 700)

### 2a — KPI cards row (keep existing, no changes)
4 cards in a row: Today's Revenue (with Today/7 Days/Month toggle),
Covers, Avg Ticket, Table Occupancy.
Card style: white bg, border: 1px solid #e5e7eb, border-radius: 8px,
padding: 20px, box-shadow: none.
Label: 13px #888, value: 24px font-weight 600 black.
Revenue card red delta text: keep as-is.

### 2b — AI Daily Summary card (keep existing, no changes)
Purple left border accent (4px solid #7C3AED), light purple bg
(#faf5ff), border: 1px solid #e9d5ff, border-radius: 8px.
"AI Daily Summary" title in purple (#7C3AED), font-weight 600.
Summary text in dark gray. Root cause line in purple, smaller font.

### 2c — Table grid REMOVED from Dashboard
Do not render T1–T8 chips on the Dashboard. They live only in
Front of House → Tables tab.

### 2d — Active Alerts section on Dashboard (deduplicated, limited)

Section title: "Active Alerts" (h2, 18px, font-weight 600) with
"See all →" link right-aligned (purple, navigates to Insights page).

Deduplicate alerts before rendering:
```javascript
const deduplicatedAlerts = alerts.reduce((acc, alert) => {
  const existing = acc.find(a => a.message === alert.message
    && a.type === alert.type);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
  } else {
    acc.push({ ...alert, count: 1 });
  }
  return acc;
}, []);

// Show max 3 on dashboard:
const dashboardAlerts = deduplicatedAlerts.slice(0, 3);
```

Alert card style (same as Insights page cards):
- Root Cause Critical: bg #fff5f5, border: 1px solid #fca5a5,
  border-radius: 8px, padding: 14px 16px
- Risk Forecast Warning: bg #fffbeb, border: 1px solid #fcd34d,
  border-radius: 8px, padding: 14px 16px

Each alert card shows:
- Top line: "{type} · {severity} · New" in small muted text (12px #888)
- Message text (14px #111)
- Count badge if count > 1: "(×{count})" in gray after message
- Acknowledge button (existing style, keep)

---

## PART 3 — Front of House page

Page title: "Front of House" (h1, 28px, font-weight 700)

Add a horizontal tab bar immediately below the page title:

```jsx
const fohTabs = [
  { id: 'tables',       label: lang === 'vi' ? 'Sơ đồ bàn' : 'Tables' },
  { id: 'orders',       label: lang === 'vi' ? 'Theo dõi đơn' : 'Orders' },
  { id: 'reservations', label: lang === 'vi' ? 'Đặt bàn' : 'Reservations' },
];
```

Tab bar style:
```css
display: flex;
gap: 0;
border-bottom: 1px solid #e5e7eb;
margin-bottom: 24px;
```

Each tab button:
```jsx
<button style={{
  padding: '10px 20px',
  border: 'none',
  borderBottom: activeTab === tab.id
    ? '2px solid #7C3AED' : '2px solid transparent',
  background: 'transparent',
  color: activeTab === tab.id ? '#7C3AED' : '#666',
  fontWeight: activeTab === tab.id ? 600 : 400,
  fontSize: '14px',
  cursor: 'pointer',
}}>
  {tab.label}
</button>
```

### Tab A: Tables (Sơ đồ bàn)
Existing T1–T8 grid. No changes to content or colors.
Status colors: Dining=purple bg, Open=gray bg, Reserved=yellow bg,
Cleanup=orange bg. Keep exactly as current.

### Tab B: Orders (Theo dõi đơn)
Move Kitchen Display kanban HERE from Back of House.
Pre-load sample orders in useState if empty:
```javascript
const initialOrders = [
  { id:'ORD-001', table:'T1',
    items:['Phở bò đặc biệt','Nước chanh'],
    status:'pending',  placedAt: Date.now() - 8*60000  },
  { id:'ORD-002', table:'T5',
    items:['Bún bò Huế','Trà đá'],
    status:'kitchen',  placedAt: Date.now() - 23*60000 },
  { id:'ORD-003', table:'T7',
    items:['Cơm tấm sườn','Sinh tố xoài'],
    status:'kitchen',  placedAt: Date.now() - 11*60000 },
  { id:'ORD-004', table:'T3',
    items:['Gỏi cuốn tôm thịt'],
    status:'completed', placedAt: Date.now() - 38*60000 },
];
```

Kanban column headers:
- Pending: gray header (#f3f4f6 bg, #374151 text)
- In Kitchen: amber header (#fffbeb bg, #92400e text, border #fcd34d)
- Completed: green header (#f0fdf4 bg, #166534 text, border #86efac)

Each order card:
```jsx
<div style={{
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '12px',
  marginBottom: '8px',
}}>
  <div style={{ fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>
    {order.table} — {order.id}
  </div>
  <div style={{ fontSize:'12px', color:'#555', marginBottom:'8px' }}>
    {order.items.join(', ')}
  </div>
  <div style={{
    fontSize:'12px', fontWeight:500,
    color: elapsed < 10 ? '#16a34a'
         : elapsed < 20 ? '#d97706' : '#dc2626'
  }}>
    ⏱ {elapsed} min
  </div>
</div>
```

Where: `const elapsed = Math.floor((Date.now() - order.placedAt)/60000)`

Orders > 20 min in "kitchen" status automatically push a new alert
to the alerts array if not already present.

### Tab C: Reservations (Đặt bàn)
Move reservations section HERE from Guest Engagement.
Keep all existing content exactly:
- AI peak banner (blue bg #eff6ff, blue text)
- "Add Reservation" purple button top right
- Reservation table: Guest · Party Size · Time · Status pill
- Status pills: Confirmed=purple, Arrived=green, Cancelled=gray

---

## PART 4 — Back of House page

Page title: "Back of House" (h1, 28px, font-weight 700)

REMOVE Kitchen Display kanban (moved to Front of House → Orders tab).

Add horizontal tab bar with 3 tabs (same style as Part 3):

```javascript
const bohTabs = [
  { id: 'inventory', label: lang === 'vi' ? 'Tồn kho'          : 'Inventory' },
  { id: 'labor',     label: lang === 'vi' ? 'Nhân sự'           : 'Labor'     },
  { id: 'supply',    label: lang === 'vi' ? 'Cung ứng & Doanh thu' : 'Supply & Revenue' },
];
```

### Tab A: Inventory (Tồn kho)
Existing inventory table with ONE change — add inline stock update.

Table columns: Item | Stock | Par Level | Stockout Projection | Update

In the "Update" column, add a number input per row:
```jsx
<td style={{ padding:'10px 12px' }}>
  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
    <button
      onClick={() => updateStock(item.id, item.stock - 0.5)}
      style={{ width:'24px', height:'24px', borderRadius:'4px',
               border:'1px solid #ddd', background:'white',
               cursor:'pointer', fontSize:'14px', lineHeight:1 }}
    >−</button>
    <input
      type="number"
      value={item.stock}
      step="0.5"
      min="0"
      onChange={(e) => updateStock(item.id, parseFloat(e.target.value)||0)}
      style={{ width:'60px', padding:'3px 6px', border:'1px solid #ddd',
               borderRadius:'4px', fontSize:'13px', textAlign:'center' }}
    />
    <button
      onClick={() => updateStock(item.id, item.stock + 0.5)}
      style={{ width:'24px', height:'24px', borderRadius:'4px',
               border:'1px solid #ddd', background:'white',
               cursor:'pointer', fontSize:'14px', lineHeight:1 }}
    >+</button>
  </div>
</td>
```

The updateStock function:
```javascript
const updateStock = (id, newVal) => {
  const val = Math.max(0, Math.round(newVal * 10) / 10);
  setInventory(prev => prev.map(item =>
    item.id === id
      ? {
          ...item,
          stock: val,
          stockoutProjection: val <= 0
            ? 'Out of stock'
            : item.stockoutProjection, // recalculate if you have logic
          rowStatus: val <= 0 ? 'critical'
                   : val < item.parLevel * 0.3 ? 'critical'
                   : val < item.parLevel * 0.6 ? 'warning'
                   : 'ok'
        }
      : item
  ));
};
```

Row highlight: critical rows keep existing red bg (#fff5f5).
This fix closes the ⚠️ Partial → ✅ on Inventory Management.

### Tab B: Labor (Nhân sự)
Existing labor section, moved here. Zero content changes.
- Summary line: "X staff on shift · Y orders in last 2h"
- Understaffed alert badge (amber): keep exact style
- Staff list rows: Name · role · shift times · On Shift badge
- AI forecast banner at bottom: keep exact style

### Tab C: Supply & Revenue (Cung ứng & Doanh thu)
Three sections stacked vertically in this tab:

Section 1: "Profit Snapshot" — existing 4 stat cards
  (Today's Revenue, Food Cost, Labor Cost, Profit)

Section 2: "Revenue by Channel" — existing table
  GrabFood insight banner + Channel/Orders/Revenue table
  Keep exact content and styling

Section 3: "Supply Monitoring" — existing supplier table
  AI procurement banner + Supplier/Items/Last Delivery/On-Time table
  Reliability % colors: green ≥90%, amber 70–89%, red <70%
  Keep exact content and styling

---

## PART 5 — Guest Engagement page

Page title: "Guest Engagement" (h1, 28px, font-weight 700)

REMOVE Reservations section (moved to Front of House → Reservations tab).

Keep only:
### Top Repeat Guests / Loyalty section
- Section title: "Top Repeat Guests" (keep existing)
- Table: Guest · Visits · Points · Tier · Last Visit (keep existing)
- UPDATE tier pill colors:
  ```jsx
  const tierColors = {
    Gold:   { bg:'#FEF3C7', color:'#92400E', border:'#F59E0B' },
    Silver: { bg:'#F1F5F9', color:'#475569', border:'#94A3B8' },
    Bronze: { bg:'#FEF0E7', color:'#92400E', border:'#F97316' },
  };

  <span style={{
    background: tierColors[guest.tier].bg,
    color: tierColors[guest.tier].color,
    border: `1px solid ${tierColors[guest.tier].border}`,
    padding: '2px 10px',
    borderRadius: '99px',
    fontSize: '12px',
    fontWeight: 500,
  }}>
    {guest.tier}
  </span>
  ```
- "Total members: X" line: keep
- At-risk insight banner (amber): keep exact style

---

## PART 6 — Insights page (NO CHANGES)

This page is already the best screen in the app. Do not change anything:
- Type filter dropdown (All / Root Cause / Risk Forecast)
- Severity filter dropdown (All / Critical / Warning)
- Alert cards with colored borders (red=Critical, yellow=Warning)
- "Root Cause · Critical · New" metadata line per card
- Acknowledge button per card

---

## PART 7 — AI Consultant page

Page title: "AI Consultant" (h1, 28px, font-weight 700)
Subtitle: "Ask a question to get started." → keep as empty-state text,
hide once first message is sent.

### Message bubble styling

User messages (right-aligned):
```jsx
<div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'12px' }}>
  <div style={{
    maxWidth: '70%',
    padding: '10px 14px',
    background: '#7C3AED',
    color: 'white',
    borderRadius: '18px 18px 4px 18px',
    fontSize: '14px',
    lineHeight: 1.5,
  }}>
    {msg.content}
  </div>
</div>
```

Assistant messages (left-aligned):
```jsx
<div style={{ display:'flex', justifyContent:'flex-start', marginBottom:'12px' }}>
  <div style={{
    width: '28px', height: '28px',
    borderRadius: '50%',
    background: '#f3f0ff',
    border: '1px solid #e9d5ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', marginRight: '8px', flexShrink: 0,
  }}>
    🤖
  </div>
  <div style={{
    maxWidth: '75%',
    padding: '10px 14px',
    background: 'white',
    color: '#111',
    border: '1px solid #e5e7eb',
    borderRadius: '4px 18px 18px 18px',
    fontSize: '14px',
    lineHeight: 1.6,
  }}>
    {msg.content}
  </div>
</div>
```

Loading indicator (while waiting for API response):
```jsx
<div style={{ display:'flex', alignItems:'center', gap:'4px',
              padding:'10px 14px', background:'white',
              border:'1px solid #e5e7eb', borderRadius:'4px 18px 18px 18px',
              width:'fit-content' }}>
  <span style={{ width:'6px', height:'6px', borderRadius:'50%',
                 background:'#7C3AED', animation:'bounce 1s infinite' }}/>
  <span style={{ width:'6px', height:'6px', borderRadius:'50%',
                 background:'#7C3AED', animation:'bounce 1s infinite 0.2s' }}/>
  <span style={{ width:'6px', height:'6px', borderRadius:'50%',
                 background:'#7C3AED', animation:'bounce 1s infinite 0.4s' }}/>
</div>
```

Add keyframe: `@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }`

### Quick-prompt chips (keep existing 4, style update)
```jsx
// Chip style:
<button style={{
  padding: '6px 14px',
  borderRadius: '99px',
  border: '1px solid #e9d5ff',
  background: '#faf5ff',
  color: '#7C3AED',
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}}>
  {chip.label}
</button>
```

### Input bar (keep existing, style polish)
```jsx
<div style={{
  position: 'sticky',
  bottom: 0,
  background: '#f9fafb',
  paddingTop: '12px',
  borderTop: '1px solid #e5e7eb',
}}>
  {/* Chips row */}
  <div style={{ display:'flex', gap:'8px', marginBottom:'10px',
                flexWrap:'wrap' }}>
    {quickPrompts.map(...)}
  </div>
  {/* Input row */}
  <div style={{ display:'flex', gap:'8px' }}>
    <input
      style={{
        flex: 1,
        padding: '10px 16px',
        border: '1px solid #e5e7eb',
        borderRadius: '99px',
        fontSize: '14px',
        outline: 'none',
      }}
      placeholder={lang === 'vi'
        ? 'Hỏi về vận hành nhà hàng...'
        : 'Ask about your business...'}
    />
    <button style={{
      padding: '10px 20px',
      background: '#7C3AED',
      color: 'white',
      border: 'none',
      borderRadius: '99px',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: '14px',
    }}>
      {lang === 'vi' ? 'Gửi' : 'Send'}
    </button>
  </div>
</div>
```

---

## PART 8 — Settings page (minimal change)

Keep existing Language dropdown.
Add a note below the dropdown:
```
"Tip: You can also switch language quickly using the VI/EN button in the top navigation bar."
```
No other changes.

---

## CONSTRAINTS

- Do not rebuild the layout shell or switch to a sidebar
- Do not change the Insights page at all
- Do not rename existing nav items (keep English names exactly)
- Do not change any useState data shapes — only add new keys if needed
- Do not add npm packages
- All new label strings must have both VI and EN values in the
  existing translations object
- The purple accent color throughout is #7C3AED — use it consistently
  for active states, buttons, and focus indicators
- After all changes, confirm Inventory Management is ✅ (not ⚠️)

---

## SUMMARY OF ALL CHANGES

| Part | Change | Impact |
|---|---|---|
| 0 | Active nav item = bold + purple underline | Visual clarity |
| 1 | VI/EN toggle added to navbar | Localization visible |
| 2c | Table grid removed from Dashboard | Cleaner Dashboard |
| 2d | Alerts deduplicated + max 3 on Dashboard | Fixes "111 alerts" bug |
| 3 | Front of House gets Tables/Orders/Reservations tabs | Fills sparse page |
| 3b | Kitchen Display gets sample order data | Fixes empty kanban |
| 3c | Reservations moved from Guest Engagement to FoH | Better grouping |
| 4 | Back of House gets Inventory/Labor/Supply tabs | Less scrolling |
| 4a | Inventory inline +/- update input added | Closes ⚠️ Partial |
| 5 | Loyalty tier pills get distinct Gold/Silver/Bronze colors | Polish |
| 7 | AI chat gets styled message bubbles + loading dots | Chat feels real |
| 8 | Settings gets VI/EN tip note | Discoverability |
