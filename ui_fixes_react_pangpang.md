# Claude Code Prompt — Targeted UI Fixes (Pang Pang SmartOps React)

## Context

The app is a React (Vite) + Express + Supabase app deployed on Vercel
(frontend) and Render (backend). Firebase handles auth. Supabase provides
real-time subscriptions on all operational tables.

**DO NOT touch:**
- Any backend route in `backend/src/server.js`
- Any Supabase query, insert, update, or delete logic
- Any Firebase auth logic or `requireAuth` middleware
- Any real-time subscription setup (`supabase.channel(...)`)
- Any `useEffect` that fetches data from the backend or Supabase
- The `runAnalysisInternal` scheduler or `/api/insights/run` call
- Role-based access control (staff vs manager/admin redirect logic)
- CSS variable definitions in `frontend/src/index.css`

Apply only the visual and layout fixes listed below. Each fix targets
a specific file and component — do not modify files not listed.

---

## Fix 1 — Front of House table grid: sort order and status colors

**File:** `frontend/src/pages/FrontOfHouse.jsx`

**Issue A — Tables render in random order.**
The 8-table grid (T01–T08) renders in whatever order Supabase returns
them. They should always display T01 → T08 left-to-right, top-to-bottom.

```jsx
// BEFORE (wherever tables are mapped):
{tables.map(table => <TableCard key={table.table_id} table={table} />)}

// AFTER — sort before render, do NOT sort the state array itself:
{[...tables]
  .sort((a, b) => {
    const n = t => parseInt(t.table_id.replace(/\D/g, ''));
    return n(a) - n(b);
  })
  .map(table => <TableCard key={table.table_id} table={table} />)
}
```

This is a render-only sort. It does not mutate state or affect any
Supabase write that uses the `tables` array.

**Issue B — Status colors are too similar.**
`dining` (pink) and `cleanup` (pinkish-orange) are hard to distinguish.
`open` has no strong visual identity. Replace the status color map with
four clearly distinct colors. Find wherever `statusConfig` or inline
status styles are defined and replace:

```jsx
// Replace your existing status color map with:
const tableStatusConfig = {
  open: {
    cardBg:     '#F0F4FF',
    cardBorder: '#C7D4F5',
    textColor:  '#3B5BDB',
    label:      lang === 'vi' ? 'Trống'      : 'Open',
  },
  reserved: {
    cardBg:     '#FFFBEB',
    cardBorder: '#F5D878',
    textColor:  '#92400E',
    label:      lang === 'vi' ? 'Đặt trước'  : 'Reserved',
  },
  dining: {
    cardBg:     '#FFF0F3',
    cardBorder: '#FFB3C1',
    textColor:  '#C9003A',
    label:      lang === 'vi' ? 'Đang ăn'    : 'Dining',
  },
  cleanup: {
    cardBg:     '#FFF7ED',
    cardBorder: '#FCD5A0',
    textColor:  '#92400E',
    label:      lang === 'vi' ? 'Dọn bàn'    : 'Cleanup',
  },
};
```

**Issue C — Time badge on dining tables has no clear threshold logic.**
The elapsed time badge currently uses ad-hoc colors. Replace with:

```jsx
// Add this helper near the top of the component (pure function, no side effects):
const getElapsedBadgeStyle = (seatedAt) => {
  if (!seatedAt) return null;
  const minutes = Math.floor((Date.now() - new Date(seatedAt)) / 60000);
  if (minutes < 30) return {
    bg: '#DCFCE7', color: '#166534', border: '#86EFAC',
    label: `${minutes}m`,
  };
  if (minutes < 60) return {
    bg: '#FEF9C3', color: '#854D0E', border: '#FDE047',
    label: `${minutes}m`,
  };
  return {
    bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5',
    label: `${minutes}m ⚠`,
  };
};

// In the table card JSX, replace however the time badge renders:
{table.status === 'dining' && table.seated_at && (() => {
  const style = getElapsedBadgeStyle(table.seated_at);
  return style ? (
    <span style={{
      display: 'inline-block',
      marginTop: '6px',
      padding: '2px 10px',
      borderRadius: '99px',
      fontSize: '12px',
      fontWeight: 600,
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
    }}>
      {style.label}
    </span>
  ) : null;
})()}
```

`table.seated_at` maps to the `tables.seated_at` column in Supabase —
do not rename this field or add any Supabase query. It is already
fetched by the existing subscription.

**Issue D — Grid is 3 columns, leaving orphan cards.**
8 tables in a 3-column grid = 2 full rows + 2 orphans on row 3.
Change to 4 columns for two clean symmetric rows:

```jsx
// Find the table grid container and change grid-template-columns:
// BEFORE (3 columns):
style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}

// AFTER (4 columns):
style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}
```

**Issue E — Each table card must show exactly ONE status label.**
If a card currently renders more than one status string (e.g. both
`table.status` and a secondary state), remove all but the primary
`tableStatusConfig[table.status].label`. Check the card JSX and ensure
there is only one status text element per card.

**Update the legend** below the grid to use the new four colors:

```jsx
const legendItems = [
  { key: 'open',     label: lang === 'vi' ? 'Trống'     : 'Open',     bg: '#F0F4FF', border: '#C7D4F5', color: '#3B5BDB' },
  { key: 'reserved', label: lang === 'vi' ? 'Đặt trước' : 'Reserved', bg: '#FFFBEB', border: '#F5D878', color: '#92400E' },
  { key: 'dining',   label: lang === 'vi' ? 'Đang ăn'   : 'Dining',   bg: '#FFF0F3', border: '#FFB3C1', color: '#C9003A' },
  { key: 'cleanup',  label: lang === 'vi' ? 'Dọn bàn'   : 'Cleanup',  bg: '#FFF7ED', border: '#FCD5A0', color: '#92400E' },
];
```

---

## Fix 2 — Kitchen Kanban: column height and time color coding

**File:** `frontend/src/pages/FrontOfHouse.jsx` (Orders tab / Kitchen Kanban)

**Issue A — Columns don't fill vertical height.**
The kanban renders short columns with large empty space below, making
it look broken when there are few orders. The column containers need
a minimum height so they always look intentional even when empty.

```jsx
// Find the kanban column containers and add minHeight:
// Each column wrapper (Pending / In Kitchen / Completed):
style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'white',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  overflow: 'hidden',
  minHeight: '400px',   // ADD THIS
}}
```

**Issue B — Time elapsed on order cards has no color coding.**
Cards in "In Kitchen" > 20 minutes should visually scream urgency.
Add consistent color coding to the elapsed time display on each card.

```jsx
// Add this helper (pure function, no side effects, no backend call):
const getOrderTimeStyle = (queuedAt) => {
  const minutes = Math.floor((Date.now() - new Date(queuedAt)) / 60000);
  if (minutes < 10) return { color: '#16a34a', weight: 400, icon: '⏱' };
  if (minutes < 20) return { color: '#d97706', weight: 600, icon: '⏱' };
  return { color: '#dc2626', weight: 700, icon: '⚠' };
};

// In the order card time display, replace static text with:
{(() => {
  const minutes = Math.floor(
    (Date.now() - new Date(item.queued_at)) / 60000
  );
  const style = getOrderTimeStyle(item.queued_at);
  return (
    <span style={{ color: style.color, fontWeight: style.weight, fontSize: '12px' }}>
      {style.icon} {minutes}m ago
    </span>
  );
})()}
```

`item.queued_at` maps to `kitchen_queue.queued_at` — already fetched
by the existing Supabase subscription. Do not add a new query.

**Issue C — Column header dot colors.**
Each kanban column should have a distinct status dot:

```jsx
// Pending column header dot:
<span style={{ width:'8px', height:'8px', borderRadius:'50%',
               background:'#F59E0B', display:'inline-block' }} />

// In Kitchen column header dot:
<span style={{ width:'8px', height:'8px', borderRadius:'50%',
               background:'#4F46E5', display:'inline-block' }} />

// Completed column header dot:
<span style={{ width:'8px', height:'8px', borderRadius:'50%',
               background:'#059669', display:'inline-block' }} />
```

---

## Fix 3 — Dashboard alerts: deduplicate and cap at 3

**File:** `frontend/src/pages/Dashboard.jsx`

**Issue:** The Dashboard shows 100+ alerts, many with identical summaries
(e.g. multiple "Shrimp projected to run out" insights), making the page
look broken.

The existing `insights` state is already populated by the Supabase
real-time subscription — do not change the subscription or the fetch.
Only change how alerts are rendered:

```jsx
// Add this derived value inside the component, after insights state is available:
// (Do NOT replace the insights state — derive from it for display only)
const dashboardAlerts = useMemo(() => {
  const seen = new Map();
  for (const insight of insights) {
    const key = (insight.summary_en || insight.summary_vi || '').trim();
    if (!seen.has(key)) {
      seen.set(key, { ...insight, count: 1 });
    } else {
      seen.get(key).count += 1;
    }
  }
  return [...seen.values()]
    .filter(i => i.status !== 'acted_on')
    .slice(0, 3);
}, [insights]);

// Import useMemo at the top if not already imported:
import { useState, useEffect, useMemo } from 'react';

// Replace wherever alerts are mapped in the Dashboard JSX:
// BEFORE:
{insights.map(insight => <AlertCard key={insight.id} insight={insight} />)}

// AFTER:
{dashboardAlerts.map(insight => (
  <AlertCard key={insight.id} insight={insight} count={insight.count} />
))}

// In the AlertCard component (or inline), show count badge if count > 1:
{count > 1 && (
  <span style={{
    fontSize: '11px',
    color: 'var(--pp-text-muted)',
    marginLeft: '6px',
  }}>
    (×{count})
  </span>
)}

// Add "See all" link after the 3 alerts:
<div style={{ textAlign: 'right', marginTop: '8px' }}>
  <a
    href="/insights"
    style={{ fontSize: '13px', color: 'var(--pp-primary)', fontWeight: 500 }}
  >
    {lang === 'vi' ? 'Xem tất cả →' : 'See all alerts →'}
  </a>
</div>
```

The `insights` state, its Supabase subscription, and any write operations
(acknowledge, etc.) on the Insights page are completely untouched.

---

## Fix 4 — Guest Management: loyalty tier pill colors

**File:** `frontend/src/pages/GuestEngagement.jsx`

**Issue:** All tier pills (Gold, Silver, Bronze) currently render with
the same visual style, making it impossible to distinguish tiers
at a glance.

The tier logic (Gold ≥10 visits, Silver ≥5, Bronze <5) is already
correct — do not change the threshold logic. Only update the pill styles:

```jsx
// Add this map near the top of the component or in a constants file:
const TIER_STYLES = {
  Gold: {
    background: 'var(--pp-gold-bg)',
    color:      'var(--pp-gold-text)',
    border:     '1px solid var(--pp-gold-border)',
    icon:       '★',
  },
  Silver: {
    background: 'var(--pp-silver-bg)',
    color:      'var(--pp-silver-text)',
    border:     '1px solid var(--pp-silver-border)',
    icon:       '●',
  },
  Bronze: {
    background: 'var(--pp-bronze-bg)',
    color:      'var(--pp-bronze-text)',
    border:     '1px solid var(--pp-bronze-border)',
    icon:       '▲',
  },
};

// Replace wherever tier pills are rendered:
// BEFORE (uniform style):
<span className="tier-pill">{guest.tier}</span>

// AFTER:
<span style={{
  ...TIER_STYLES[guest.tier],
  padding:      '3px 10px',
  borderRadius: '99px',
  fontSize:     '12px',
  fontWeight:   600,
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '4px',
}}>
  <span style={{ fontSize: '10px' }}>{TIER_STYLES[guest.tier]?.icon}</span>
  {guest.tier}
</span>
```

The CSS variables `--pp-gold-bg`, `--pp-gold-text`, `--pp-gold-border`,
`--pp-silver-*`, and `--pp-bronze-*` are already defined in
`frontend/src/index.css` — do not add new CSS variables.

---

## Fix 5 — AI Consultant: message bubble styling

**File:** `frontend/src/pages/Consultant.jsx`

**Issue:** The chat already has red user bubbles and white AI bubbles
per the APP_SUMMARY. This fix ensures the border-radius follows the
conversational chat convention (corner nearest the avatar is squared).

```jsx
// User message bubble — right-aligned, squared bottom-right corner:
<div style={{
  display: 'flex',
  justifyContent: 'flex-end',
  marginBottom: '12px',
}}>
  <div style={{
    maxWidth:     '72%',
    padding:      '10px 14px',
    background:   'var(--pp-primary)',
    color:        'white',
    borderRadius: '18px 18px 4px 18px',  // squared bottom-right
    fontSize:     '14px',
    lineHeight:   1.5,
    wordBreak:    'break-word',
  }}>
    {msg.content}
  </div>
</div>

// AI message bubble — left-aligned, squared top-left corner:
<div style={{
  display: 'flex',
  justifyContent: 'flex-start',
  gap: '8px',
  marginBottom: '12px',
  alignItems: 'flex-start',
}}>
  <div style={{
    width: '28px', height: '28px',
    borderRadius: '50%',
    background: 'var(--pp-primary-light)',
    border: '1px solid var(--pp-primary-border)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    flexShrink: 0,
  }}>
    🤖
  </div>
  <div style={{
    maxWidth:     '75%',
    padding:      '10px 14px',
    background:   'var(--pp-card-bg)',
    color:        'var(--pp-text)',
    border:       '1px solid var(--pp-border)',
    borderRadius: '4px 18px 18px 18px',  // squared top-left
    fontSize:     '14px',
    lineHeight:   1.6,
    wordBreak:    'break-word',
  }}>
    {msg.content}
  </div>
</div>
```

The existing real-time subscription on `consultant_messages`,
the optimistic update logic, clear chat, copy message, and regenerate
functions must remain completely untouched.

---

## Fix 6 — Back of House inventory tab: ± button visual polish

**File:** `frontend/src/pages/BackOfHouse.jsx`

**Issue:** The inline stock update controls (qty ± buttons + input)
exist and write to Supabase correctly. The visual style is inconsistent
with the rest of the design system. Polish only — do not change any
`onClick` handlers or Supabase write logic.

```jsx
// Find the ± button pair and replace only the style props:

// Minus button:
<button
  onClick={/* KEEP EXISTING HANDLER EXACTLY */}
  style={{
    width: '28px', height: '28px',
    borderRadius: '6px',
    border: '1px solid var(--pp-border)',
    background: 'white',
    color: 'var(--pp-text)',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  }}
>
  −
</button>

// Number input:
<input
  // KEEP ALL EXISTING PROPS (value, onChange, type, min, step, etc.)
  style={{
    width: '60px',
    padding: '4px 6px',
    border: '1px solid var(--pp-border)',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center',
    background: 'white',
    color: 'var(--pp-text)',
  }}
/>

// Plus button:
<button
  onClick={/* KEEP EXISTING HANDLER EXACTLY */}
  style={{
    width: '28px', height: '28px',
    borderRadius: '6px',
    border: '1px solid var(--pp-primary-border)',
    background: 'var(--pp-primary-light)',
    color: 'var(--pp-primary-text)',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  }}
>
  +
</button>
```

The Save button that writes to Supabase must keep its existing
`onClick` and all other props — only update style if needed to match
the primary button convention (`background: var(--pp-primary)`,
`color: white`, `borderRadius: '8px'`).

---

## What NOT to change

- Any Supabase client call (`supabase.from(...)`, `.select()`, `.insert()`,
  `.update()`, `.delete()`, `.channel()`, `.on()`, `.subscribe()`)
- Any backend API call (`fetch('/api/...')`, `axios.get/post(...)`)
- Firebase auth logic (`onAuthStateChanged`, `signInWithEmailAndPassword`,
  `getIdToken`)
- Role-based redirects (`if role !== 'manager'...`, `navigate('/foh')`)
- The `runAnalysisInternal` trigger on Insights page load
- The `consultant_messages` real-time subscription and optimistic update logic
- CSS variable definitions in `frontend/src/index.css`
- Any `id` or `key` prop used in list rendering
- The `lang` state and VI/EN toggle — both in navbar and Settings page
- The `analytics_baseline` comparison logic in Dashboard

---

## Summary of changes

| Fix | File | What changes | Backend impact |
|---|---|---|---|
| 1A | FrontOfHouse.jsx | Table sort: render-only, T01→T08 | None |
| 1B | FrontOfHouse.jsx | Status color map: 4 distinct colors | None |
| 1C | FrontOfHouse.jsx | Time badge: 3-tier threshold colors | None |
| 1D | FrontOfHouse.jsx | Grid: 3-col → 4-col | None |
| 1E | FrontOfHouse.jsx | One status label per card | None |
| 2A | FrontOfHouse.jsx | Kanban column minHeight: 400px | None |
| 2B | FrontOfHouse.jsx | Order card elapsed time colors | None |
| 2C | FrontOfHouse.jsx | Column header dot colors | None |
| 3 | Dashboard.jsx | Alert dedup + cap at 3 + see-all link | None |
| 4 | GuestEngagement.jsx | Tier pill Gold/Silver/Bronze colors | None |
| 5 | Consultant.jsx | Message bubble border-radius polish | None |
| 6 | BackOfHouse.jsx | ± button and input visual polish | None |

After completing all fixes, confirm:
- No Supabase query was added, removed, or modified
- No backend route was called differently
- All real-time subscriptions still active
- Role-based routing (staff vs manager) still enforced
- VI/EN toggle still controls language across all pages
