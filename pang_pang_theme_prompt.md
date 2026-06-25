# Pang Pang SmartOps AI — Brand Theme Prompt

## Context

Apply the Pang Pang Thai Street Food brand identity to the app.
The brand uses: sunshine yellow, chili red, deep black, and clean white.
The result should feel energetic and Thai street-food authentic —
not a generic SaaS dashboard.

---

## Step 1 — Add CSS variables to your root stylesheet

Add these custom properties to `:root` in your global CSS file
(index.css, App.css, or wherever your global styles live):

```css
:root {
  /* Pang Pang brand tokens */
  --pp-primary:        #E8002A;   /* Chili red — buttons, active states */
  --pp-primary-hover:  #C5001F;   /* Darker red for hover */
  --pp-primary-light:  #FFEAED;   /* Light red — chip bg, summary card bg */
  --pp-primary-text:   #A8001F;   /* Text on light red backgrounds */
  --pp-primary-border: #F5A0AC;   /* Border on light red elements */

  --pp-yellow:         #FFF8D6;   /* Page background — warm, on-brand */
  --pp-yellow-strong:  #F5C800;   /* Strong yellow — decorative only */
  --pp-yellow-border:  #E8D98A;   /* Border on yellow surfaces */

  --pp-navbar-bg:      #1A1A1A;   /* Navbar background — dark */
  --pp-navbar-text:    #FFFFFF;   /* Navbar text */
  --pp-navbar-muted:   rgba(255,255,255,0.55); /* Inactive nav items */

  --pp-card-bg:        #FFFFFF;   /* All card/panel surfaces */
  --pp-border:         #E8E0C8;   /* Card borders, table dividers */
  --pp-page-bg:        #FFF8D6;   /* Main page background */

  --pp-text:           #1A1A1A;   /* Body text */
  --pp-text-muted:     #6B6045;   /* Labels, column headers */
  --pp-text-hint:      #A09070;   /* Placeholder, hints */

  /* Status colors — semantic, unchanged from current */
  --pp-success-bg:     #DCFCE7;
  --pp-success-text:   #166534;
  --pp-success-border: #86EFAC;

  --pp-warning-bg:     #FEF9C3;
  --pp-warning-text:   #854D0E;
  --pp-warning-border: #FDE047;

  --pp-danger-bg:      #FEE2E2;
  --pp-danger-text:    #991B1B;
  --pp-danger-border:  #FCA5A5;

  --pp-info-bg:        #EDE9FE;
  --pp-info-text:      #5B21B6;
  --pp-info-border:    #C4B5FD;

  --pp-neutral-bg:     #F1F5F9;
  --pp-neutral-text:   #475569;
  --pp-neutral-border: #CBD5E1;

  /* Loyalty tier colors */
  --pp-gold-bg:        #FEF3C7;
  --pp-gold-text:      #92400E;
  --pp-gold-border:    #F59E0B;

  --pp-silver-bg:      #F1F5F9;
  --pp-silver-text:    #475569;
  --pp-silver-border:  #94A3B8;

  --pp-bronze-bg:      #FEF0E7;
  --pp-bronze-text:    #92400E;
  --pp-bronze-border:  #F97316;
}
```

---

## Step 2 — Apply tokens to each component

### Navbar

```css
/* Replace current navbar styles with: */
.navbar {
  background: var(--pp-navbar-bg);        /* Dark black — grounds yellow page */
  border-bottom: none;                     /* No border needed on dark bg */
  height: 52px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-logo {
  color: var(--pp-navbar-text);
  font-weight: 700;
  font-size: 15px;
  margin-right: 16px;
}

/* Inactive nav items */
.nav-item {
  color: var(--pp-navbar-muted);
  font-weight: 400;
  font-size: 14px;
  border-bottom: 2px solid transparent;
  padding: 6px 12px;
  transition: color 0.15s ease;
}

.nav-item:hover {
  color: var(--pp-navbar-text);
}

/* ACTIVE nav item — bold + red underline */
.nav-item.active {
  color: var(--pp-navbar-text);           /* White on dark navbar */
  font-weight: 700;
  border-bottom: 2px solid var(--pp-primary);  /* Chili red underline */
}
```

In JSX:
```jsx
<nav style={{
  background: 'var(--pp-navbar-bg)',
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 24px',
  gap: '4px',
  position: 'sticky',
  top: 0,
  zIndex: 100,
}}>
  <span style={{ color:'white', fontWeight:700, fontSize:'15px', marginRight:'16px' }}>
    Pang Pang SmartOps AI
  </span>

  {navItems.map(item => (
    <button
      key={item.id}
      onClick={() => setCurrentPage(item.id)}
      style={{
        padding: '6px 12px',
        border: 'none',
        background: 'transparent',
        color: currentPage === item.id
          ? '#FFFFFF'
          : 'rgba(255,255,255,0.55)',
        fontWeight: currentPage === item.id ? 700 : 400,
        fontSize: '14px',
        borderBottom: currentPage === item.id
          ? '2px solid #E8002A'
          : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {item.label}
    </button>
  ))}

  {/* Right side */}
  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'12px' }}>
    <button
      onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
      style={{
        padding: '4px 12px',
        borderRadius: '99px',
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'transparent',
        color: 'rgba(255,255,255,0.8)',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
    </button>
    <span style={{ color:'rgba(255,255,255,0.55)', fontSize:'13px' }}>admin</span>
    <button style={{
      color: 'rgba(255,255,255,0.55)',
      background: 'transparent',
      border: 'none',
      fontSize: '13px',
      cursor: 'pointer',
    }}>
      Log out
    </button>
  </div>
</nav>
```

---

### Page content area

```jsx
<main style={{
  background: 'var(--pp-page-bg)',    /* Warm yellow — not white, not gray */
  minHeight: 'calc(100vh - 52px)',
  padding: '28px 32px',
}}>
  {/* Page title */}
  <h1 style={{
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--pp-text)',
    marginBottom: '24px',
  }}>
    {pageTitle}
  </h1>
  {/* Content */}
</main>
```

---

### Cards

```jsx
/* All content cards — white on yellow page bg */
const cardStyle = {
  background: 'var(--pp-card-bg)',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  padding: '20px',
};
```

---

### KPI summary cards

```jsx
const kpiCardStyle = {
  background: 'var(--pp-card-bg)',
  border: '1px solid var(--pp-border)',
  borderRadius: '10px',
  padding: '18px 20px',
};
/* Label: font-size 13px, color var(--pp-text-muted) */
/* Value: font-size 26px, font-weight 700, color var(--pp-text) */
/* Delta positive: color var(--pp-primary) */
/* Delta negative: color var(--pp-danger-text) */
```

---

### AI Daily Summary card

```jsx
<div style={{
  background: 'var(--pp-primary-light)',
  borderLeft: '4px solid var(--pp-primary)',
  borderRadius: '0 10px 10px 0',
  padding: '14px 18px',
  marginBottom: '20px',
}}>
  <div style={{
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--pp-primary)',
    marginBottom: '6px',
  }}>
    {lang === 'vi' ? 'Tóm tắt AI hôm nay' : 'AI Daily Summary'}
  </div>
  <div style={{ fontSize:'14px', color:'var(--pp-text)', marginBottom:'6px' }}>
    {summaryText}
  </div>
  <div style={{ fontSize:'13px', color:'var(--pp-primary-text)' }}>
    {rootCauseText}
  </div>
</div>
```

---

### Horizontal tab bars (Front of House, Back of House)

```jsx
<div style={{
  display: 'flex',
  borderBottom: '1px solid var(--pp-border)',
  marginBottom: '20px',
  background: 'var(--pp-card-bg)',
  borderRadius: '10px 10px 0 0',
  padding: '0 4px',
}}>
  {tabs.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      style={{
        padding: '11px 20px',
        border: 'none',
        background: 'transparent',
        borderBottom: activeTab === tab.id
          ? '2px solid var(--pp-primary)'
          : '2px solid transparent',
        color: activeTab === tab.id
          ? 'var(--pp-primary)'
          : 'var(--pp-text-muted)',
        fontWeight: activeTab === tab.id ? 700 : 400,
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {tab.label}
    </button>
  ))}
</div>
```

---

### Primary buttons

```jsx
/* Main CTA (Send, Add Reservation, Acknowledge) */
const primaryBtn = {
  background: 'var(--pp-primary)',
  color: 'white',
  border: 'none',
  borderRadius: '99px',
  padding: '9px 20px',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
};

/* Hover: background var(--pp-primary-hover) = #C5001F */

/* Secondary / outline button */
const secondaryBtn = {
  background: 'white',
  color: 'var(--pp-text)',
  border: '1px solid var(--pp-border)',
  borderRadius: '99px',
  padding: '7px 16px',
  fontSize: '13px',
  cursor: 'pointer',
};
```

---

### Quick-prompt chips (AI Consultant)

```jsx
const chipStyle = {
  padding: '6px 14px',
  borderRadius: '99px',
  border: '1px solid var(--pp-primary-border)',
  background: 'var(--pp-primary-light)',
  color: 'var(--pp-primary-text)',
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
```

---

### AI chat message bubbles

```jsx
/* User message (right) */
const userBubble = {
  maxWidth: '70%',
  padding: '10px 14px',
  background: 'var(--pp-primary)',     /* Chili red */
  color: 'white',
  borderRadius: '18px 18px 4px 18px',
  fontSize: '14px',
  lineHeight: 1.5,
};

/* Assistant message (left) */
const aiBubble = {
  maxWidth: '75%',
  padding: '10px 14px',
  background: 'var(--pp-card-bg)',
  color: 'var(--pp-text)',
  border: '1px solid var(--pp-border)',
  borderRadius: '4px 18px 18px 18px',
  fontSize: '14px',
  lineHeight: 1.6,
};
```

---

### Tables

```jsx
/* Table header row */
const thStyle = {
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--pp-text-muted)',
  background: 'var(--pp-yellow)',      /* Yellow header — on-brand */
  borderBottom: '1px solid var(--pp-border)',
  textAlign: 'left',
};

/* Table data row */
const tdStyle = {
  padding: '12px',
  fontSize: '14px',
  color: 'var(--pp-text)',
  borderBottom: '1px solid var(--pp-border)',
};

/* Row hover: background #FFF3D6 (slightly more yellow) */
```

---

### Status pills (unchanged logic, just confirm styles)

```jsx
const pillStyles = {
  ok:       { bg:'var(--pp-success-bg)', color:'var(--pp-success-text)', border:'var(--pp-success-border)' },
  warning:  { bg:'var(--pp-warning-bg)', color:'var(--pp-warning-text)', border:'var(--pp-warning-border)' },
  critical: { bg:'var(--pp-danger-bg)',  color:'var(--pp-danger-text)',  border:'var(--pp-danger-border)'  },
  info:     { bg:'var(--pp-info-bg)',    color:'var(--pp-info-text)',    border:'var(--pp-info-border)'    },
  neutral:  { bg:'var(--pp-neutral-bg)', color:'var(--pp-neutral-text)', border:'var(--pp-neutral-border)' },
};

const Pill = ({ status, label }) => (
  <span style={{
    background: pillStyles[status].bg,
    color: pillStyles[status].color,
    border: `1px solid ${pillStyles[status].border}`,
    padding: '3px 10px',
    borderRadius: '99px',
    fontSize: '12px',
    fontWeight: 500,
  }}>
    {label}
  </span>
);
```

---

### Insight alert cards (Insights page)

```jsx
const alertCardStyles = {
  critical: {
    background: 'var(--pp-danger-bg)',
    border: '1px solid var(--pp-danger-border)',
    metaColor: 'var(--pp-danger-text)',
  },
  warning: {
    background: 'var(--pp-warning-bg)',
    border: '1px solid var(--pp-warning-border)',
    metaColor: 'var(--pp-warning-text)',
  },
};
/* Card border-radius: 10px, padding: 14px 16px, margin-bottom: 10px */
/* Meta line (Root Cause · Critical · New): 11px, color from above */
/* Message text: 14px, color var(--pp-text) */
/* Acknowledge button: secondary style */
```

---

### Loyalty tier pills

```jsx
const tierPills = {
  Gold:   { bg:'var(--pp-gold-bg)',   color:'var(--pp-gold-text)',   border:'var(--pp-gold-border)'   },
  Silver: { bg:'var(--pp-silver-bg)', color:'var(--pp-silver-text)', border:'var(--pp-silver-border)' },
  Bronze: { bg:'var(--pp-bronze-bg)', color:'var(--pp-bronze-text)', border:'var(--pp-bronze-border)' },
};
```

---

## Step 3 — Typography

No new font needed — use system font stack:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               sans-serif;
  color: var(--pp-text);
  background: var(--pp-page-bg);
}
```

The brand uses a rounded bold display font (on posters) — we don't
need to import it. The system sans-serif at font-weight 700 reads
cleanly and loads instantly.

---

## Step 4 — What NOT to change

- Do not change any status color logic — only the CSS values above
- Do not change any useState data or feature logic
- Do not change the Insights page filter behavior
- Do not add any new npm packages for theming
- All existing feature functionality must continue to work exactly

---

## Summary of visual changes

| Element               | Before             | After (Pang Pang brand)          |
|-----------------------|--------------------|----------------------------------|
| Navbar background     | White              | Deep black #1A1A1A               |
| Active nav underline  | Purple #7C3AED     | Chili red #E8002A                |
| Page background       | Light gray #f9fafb | Warm yellow #FFF8D6              |
| Card background       | White              | White (unchanged — contrast)     |
| Card border           | #e5e7eb            | Warm #E8E0C8                     |
| Table header row      | Light gray         | Brand yellow #FFF8D6             |
| Primary buttons       | Purple #7C3AED     | Chili red #E8002A                |
| AI summary card       | Purple border/bg   | Red border + light red bg        |
| AI chat user bubble   | Purple             | Chili red #E8002A                |
| Quick-prompt chips    | Purple tint        | Light red tint                   |
| Active tab underline  | Purple             | Chili red                        |
| Focus rings           | Purple             | Chili red                        |
| Page title h1         | Black              | Black (unchanged)                |
| Muted text            | Gray #666          | Warm brown #6B6045               |
