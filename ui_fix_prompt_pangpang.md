# UI Fix Prompt — Pang Pang SmartOps (code.html)
# Visual fixes only. Do NOT touch any JS logic, data, or function behavior.

---

## CRITICAL CONSTRAINT — READ BEFORE MAKING ANY CHANGE

This is a single HTML file. The existing JS (`advanceOrder`, vibration
feedback, all event listeners) must remain completely untouched. Only
modify HTML attributes, Tailwind class strings, and inline styles.
Do not add, remove, or rename any `id` attributes — the JS targets
`pending-list`, `progress-list`, `completed-list`, `col-pending` by id.

---

## Fix 1 — Bottom nav active indicator: border-top not border-bottom

**Screen affected:** All screens (bottom nav is global)

**Issue:** The active nav item (FOH in screenshot 6) uses
`border-t-4 border-primary` — this puts the red line at the TOP of
the nav item, visually detached from the icon/label. Per DESIGN.md:
"Active links are marked by a 4px Chili Red indicator line — bottom
on top-nav, **top on bottom-nav**." This is actually correct per spec
but looks visually odd because the border-top sits above the icon
with no padding separation.

**Fix:** Add `pt-1` and push the indicator line to sit flush at the
very top edge of the nav bar, not between the line and the content.
Replace the active nav item classes:

```html
<!-- BEFORE (active nav item): -->
class="flex flex-col items-center justify-center text-primary border-t-4 border-primary pt-1 active:scale-95 transition-transform"

<!-- AFTER: -->
class="flex flex-col items-center justify-center text-primary relative active:scale-95 transition-transform"
```

And add an absolute pseudo-indicator as a sibling span at the top:
```html
<a class="flex flex-col items-center justify-center text-primary relative active:scale-95 transition-transform" href="#">
  <span class="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-full"></span>
  <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">storefront</span>
  <span class="font-label-md text-label-md">FOH</span>
</a>
```

This gives a centered pill-shaped red indicator flush at the top,
matching the design spec's "subtle 2px rounded edge on the indicator"
note (use `rounded-b-full` for pill shape on top bar).

Apply to whichever nav item is active — FOH in the current HTML.

---

## Fix 2 — Top header: add "SmartOps" subtitle to logo

**Screen affected:** Screenshots 1, 2, 3, 4, 5, 6 — all screens

**Issue:** Current header shows only "Pang Pang" in one line. All
screenshots show a two-line logo: "Pang Pang" bold on top,
"SmartOps" or "SmartOps AI" smaller below.

**Fix:** Replace the h1 inside the header logo group:

```html
<!-- BEFORE: -->
<h1 class="font-headline-md text-headline-md font-black text-primary leading-none">Pang Pang</h1>

<!-- AFTER: -->
<div class="leading-none">
  <div class="text-[20px] font-black text-primary leading-tight tracking-tight">Pang Pang</div>
  <div class="text-[11px] font-semibold text-on-surface-variant tracking-widest uppercase leading-tight">SmartOps AI</div>
</div>
```

---

## Fix 3 — Top header: user avatar should show photo circle, not icon

**Screen affected:** Screenshots 2, 3, 4, 5 — all show a photo avatar

**Issue:** Current code renders a Material Symbol `person` icon inside
a red circle. Screenshots show a photo avatar (circular image).

**Fix:** Replace the avatar div with an img using a placeholder:

```html
<!-- BEFORE: -->
<div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container">
  <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">person</span>
</div>

<!-- AFTER: -->
<div class="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20">
  <img
    src="https://ui-avatars.com/api/?name=Admin&background=E8002A&color=fff&size=80"
    alt="Admin avatar"
    class="w-full h-full object-cover"
  />
</div>
```

This uses a public avatar API (no backend) — the initials "Admin"
render on a red background matching the brand.

---

## Fix 4 — Kanban board: columns don't fill vertical height

**Screen affected:** Screenshot 6 — Kitchen Kanban

**Issue:** The kanban board shows only 2 cards in the Pending column
and then a large empty beige space below. The column cards don't fill
the available height between the tab bar and the bottom nav.

**Fix:** The `<main>` element and kanban container need proper height
constraints. Find the main element and kanban container and update:

```html
<!-- BEFORE: -->
<main class="flex-1 flex flex-col overflow-hidden">

<!-- AFTER: -->
<main class="flex-1 flex flex-col overflow-hidden" style="height: calc(100dvh - 64px - 64px);">
```

Where 64px top = header height, 64px bottom = nav height. Also ensure
the kanban board div has `h-full`:

```html
<!-- Find the kanban board container div and ensure it has: -->
class="flex-1 overflow-x-auto overflow-y-hidden bg-secondary-fixed p-4"
<!-- Change to: -->
class="flex-1 overflow-x-auto overflow-y-hidden bg-secondary-fixed p-4 h-full"
```

And each column section:
```html
<!-- Find: -->
class="flex-1 flex flex-col bg-surface-container-low rounded-xl border border-outline/10 overflow-hidden"
<!-- Ensure it has min-h-0 to allow flex shrinking: -->
class="flex-1 flex flex-col bg-surface-container-low rounded-xl border border-outline/10 overflow-hidden min-h-0"
```

---

## Fix 5 — Kanban order cards: delay indicator is inconsistent

**Screen affected:** Screenshot 6 — "15m ago" shows in red with `!`
icon for Bún Chả but uses a different visual pattern than "2m ago"

**Issue:** "15m ago" uses red text + `!` exclamation icon — good for
urgency. But "2m ago" uses the same muted text style as non-urgent.
The DESIGN.md specifies "Danger (Overdue) should utilize a subtle
pulse animation." Add consistent time color coding.

**Fix:** In each order card's time display span, add time-based
classes. Find the time spans in the pending order cards:

For cards ≤ 10 min (normal):
```html
<span class="text-on-surface-variant text-[10px] flex items-center gap-1">
  <span class="material-symbols-outlined text-[12px]">schedule</span> 2m ago
</span>
```

For cards > 10 min and ≤ 20 min (warning):
```html
<span class="text-warning text-[10px] flex items-center gap-1 font-bold">
  <span class="material-symbols-outlined text-[12px]">schedule</span> 15m ago
</span>
```

For cards > 20 min (danger — add pulse):
```html
<span class="text-danger text-[10px] flex items-center gap-1 font-bold animate-pulse-danger">
  <span class="material-symbols-outlined text-[12px]">warning</span> 22m ago
</span>
```

The `animate-pulse-danger` class is already defined in your `<style>`
block — do not remove it.

---

## Fix 6 — Kanban: "IN KIT..." column header is clipped

**Screen affected:** Screenshot 6 — the second column header is cut off
showing "IN KIT" instead of "IN KITCHEN"

**Issue:** The kanban has `min-w-[900px]` on desktop but on mobile the
horizontal scroll clips the second column label visually. The column
headers should not clip text.

**Fix:** Add `whitespace-nowrap` to the column header h2 elements:

```html
<!-- Find each column header h2 and add whitespace-nowrap: -->
<h2 class="font-label-lg text-label-lg flex items-center gap-2 whitespace-nowrap">
  <span class="w-2 h-2 rounded-full bg-warning"></span>
  PENDING
</h2>
```

Apply `whitespace-nowrap` to all three column header h2 elements:
PENDING, IN KITCHEN, COMPLETED.

---

## Fix 7 — Kanban: "IN KITCHEN" column dot color

**Screen affected:** Screenshot 6 (partially visible second column)

**Issue:** Per DESIGN.md and screenshot 6, the second column (In
Kitchen) shows a blue dot indicator. But if the dot is currently
using `bg-warning` (amber), update:

```html
<!-- Pending column dot: bg-warning (amber) — keep -->
<!-- In Kitchen column dot: bg-info (blue/indigo) — update to: -->
<span class="w-2 h-2 rounded-full bg-info"></span>

<!-- Completed column dot: bg-success (green) — update to: -->
<span class="w-2 h-2 rounded-full bg-success"></span>
```

---

## Fix 8 — Body bottom padding for fixed nav

**Screen affected:** All screens

**Issue:** The fixed bottom nav (h-16 = 64px) overlaps page content.
The body or main scroll container needs bottom padding equal to nav
height so content isn't hidden beneath the nav.

**Fix:** Add `pb-16` to the `<body>` tag or `<main>` element:

```html
<!-- BEFORE: -->
<body class="bg-secondary-fixed min-h-screen flex flex-col font-body-md text-on-surface antialiased">

<!-- AFTER: -->
<body class="bg-secondary-fixed min-h-screen flex flex-col font-body-md text-on-surface antialiased pb-16">
```

---

## Fix 9 — Tab bar: active tab underline alignment

**Screen affected:** Screenshots 3 and 6 — "Tables" / "KITCHEN KANBAN"

**Issue:** The active tab uses `border-b-2 border-primary` which is
correct, but the border sits inside the tab button's padding and
doesn't extend flush to the full-width bottom border of the tab bar.

**Fix:** Ensure the tab bar container has `border-b border-on-surface/5`
(already has this) and each active tab uses `-mb-px` to make its
2px border overlap the container's 1px border, creating a flush look:

```html
<!-- Active tab button — add -mb-px: -->
<button class="px-4 py-3 font-label-md text-label-md border-b-2 border-primary text-primary transition-colors -mb-px">
  KITCHEN KANBAN
</button>

<!-- Inactive tab buttons — ensure border-b-2 border-transparent: -->
<button class="px-4 py-3 font-label-md text-label-md border-b-2 border-transparent text-on-surface-variant hover:text-primary transition-colors -mb-px">
  FLOOR PLAN
</button>
```

Apply `-mb-px` and `border-b-2 border-transparent` to all inactive
tabs so they reserve the same space as the active tab.

---

## Fix 10 — Card arrow icon: use filled style for navigation arrows

**Screen affected:** Screenshot 6 — order cards show `→` arrows

**Issue:** The right-arrow `→` at the bottom right of each order card
is a Unicode character. It should use the Material Symbol
`arrow_forward` for consistency with the rest of the icon system.

**Fix:** Find the arrow spans in order cards and replace:

```html
<!-- BEFORE (wherever → Unicode appears in order cards): -->
<span class="text-primary">→</span>

<!-- AFTER: -->
<span class="material-symbols-outlined text-primary text-[18px]">arrow_forward</span>
```

---

## What NOT to touch

- The `advanceOrder(card)` JavaScript function — do not modify
- The `vibrate` event listener — do not modify
- Any `id` attribute (`pending-list`, `progress-list`, `completed-list`,
  `col-pending`) — the JS depends on these exactly
- The `data-status` attributes on order cards — JS reads these
- The `onclick="advanceOrder(this)"` on order cards — do not remove
- The Tailwind config `<script id="tailwind-config">` — do not change
- The `@keyframes pulse-danger` and `.animate-pulse-danger` CSS — keep
- The `.kanban-column` scrollbar-hide CSS — keep
- The `.glass-card` CSS class definition — keep
- Any color token values in the Tailwind config

---

## Summary table

| Fix | Element | Change type |
|-----|---------|-------------|
| 1 | Bottom nav active indicator | Class replacement — visual only |
| 2 | Header logo | HTML addition — no logic |
| 3 | User avatar | img replace — no logic |
| 4 | Kanban height | Class/style addition — layout only |
| 5 | Order card time indicators | Class update — visual only |
| 6 | Column header clipping | Add `whitespace-nowrap` — visual only |
| 7 | Column status dots | Class update — visual only |
| 8 | Body bottom padding | Class addition — layout only |
| 9 | Tab underline flush | Add `-mb-px` — visual only |
| 10 | Arrow icons | Swap Unicode → Material Symbol |

All changes are HTML/class modifications. Zero JS changes.
