# Pang Pang SmartOps AI — Vibe Coding Report
**Group 13 · June 2026**

---

## 1. Development Process with Claude: Key Prompts & Iterations

The entire application was built through **conversational prompting with Claude Code** — no boilerplate was written manually. The starting point was a single master brief (`PangPang_SmartOps_AI_Build_Instructions.md`) handed to Claude as the opening prompt:

> *"Build Pang Pang SmartOps AI, a bilingual AI-powered restaurant operations dashboard. Stack: React + Vite + Tailwind, Node.js + Express, Firebase Firestore + Auth. Follow the build order section by section and ask before deviating."*

**Key prompt moments across the build:**

| Phase | Representative Prompt | Outcome |
|---|---|---|
| Scaffold | *"Scaffold the monorepo — Vite React frontend, Express backend, Firebase connected, i18n VI/EN toggle working end-to-end."* | Working bilingual shell in one session |
| Data model | *"Seed Firestore with realistic June 2026 orders: 1,560 orders, lunch/dinner sessions, 70% occupancy, dine-in + takeaway channels only."* | `generateJuneData.js` script + `resetJuneData.js` |
| FOH POS | *"The create-order / send-to-kitchen / mark-served buttons all call localhost:4000. Rewrite them as direct Firestore writes using runTransaction and writeBatch."* | Eliminated backend dependency; POS works in production |
| AI Consultant | *"Integrate Cohere command-a-03-2025. Ground every reply in live Firestore data — today's orders, kitchen queue, inventory, reservations. Manager/admin only."* | Working LLM chatbot grounded in real data |
| Database crisis | *"Firestore 50K read/day quota exhausted — 2000+ orders exceed the Spark plan. Migrate everything to Supabase PostgreSQL. Keep Firebase Auth only."* | Full Firestore → Supabase migration in one session |
| Dashboard redesign | *"Redesign the Dashboard: left sidebar with live floor plan tiles + guest tracking panel. Main area: KPI cards, AI summary card, alerts feed. The floor plan should stretch to match the alerts panel height."* | Sidebar layout, real-time floor plan, guest tracking |
| UI polish | *"Apply these 10 fixes: kanban advance buttons need → arrow suffix, tier pills must use brand token variables, BOH buttons need spacing normalized, navbar avatar sizing off…"* | Batch UI fixes applied across all pages |
| Bug fix | *"AI Consultant crashes on wait-time queries — the backend passes queue data without seated_at so duration is undefined."* | Enriched queue data before Cohere call |
| Revenue seed | *"Write a seed script that populates today with a busy-scenario revenue profile and realistic menu prices for the demo."* | Demo-ready data state |

**Iteration pattern:** Each session followed a tight loop — Claude proposes → implements → commits → user observes in browser → user reports the delta (bug / visual gap / missing feature) as a plain-language prompt → Claude iterates. The codebase reached **99 commits across 8 days** entirely through this cycle.

---

## 2. Development Workflow

```
User prompt (plain language)
        ↓
Claude Code analyses codebase context
        ↓
Claude writes / edits files (React, Express, SQL, scripts)
        ↓
git commit (auto-staged, descriptive message)
        ↓
Vercel auto-deploy (frontend) / Render deploy (backend)
        ↓
User reviews live URL → next prompt
```

**Tools & Services:**

| Role | Tool |
|---|---|
| AI coding assistant | Claude Code (claude-sonnet-4-6) |
| Frontend hosting | Vercel (auto-deploy from GitHub `main`) |
| Backend hosting | Render (Node.js persistent process) |
| Database | Supabase (PostgreSQL + real-time subscriptions) |
| Auth | Firebase Authentication (email/password) |
| LLM for AI Consultant | Cohere `command-a-03-2025` (free tier) |
| Version control | GitHub |
| Local dev | Vite dev server + nodemon |

**Branch strategy:** Single `main` branch — every prompt produced a commit directly to main. Vercel's GitHub integration triggered a production deploy on every push, so the live URL reflected the latest state within ~60 seconds of each commit.

**Database migration mid-project:** The original Firestore database hit the free-tier 50K reads/day limit repeatedly as order volume grew. Rather than pay to upgrade, Claude was prompted to migrate the entire data layer to Supabase PostgreSQL in one session — controllers, real-time subscriptions, seed scripts, RLS policies, and schema DDL all rewritten together.

---

## 3. Screenshots & Live URL

**Live application:** `https://final-wine-five.vercel.app`
- Login: `hgiang2308@gmail.com` / `[password on file]` (admin)
- Staff demo: `staff.test@pangpang.local` (FOH/BOH only)

**GitHub repository:** `https://github.com/GIANG2385/FINAL`

**Key screens:**

| Screen | Path | What it shows |
|---|---|---|
| Dashboard | `/dashboard` | KPI cards, live floor plan sidebar, AI summary, alerts |
| Front of House | `/foh` | Table grid → POS order panel → kitchen kanban → reservations |
| Back of House | `/boh` | Inventory with stock deduction, labor roster, profit snapshot, recipes |
| AI Consultant | `/consultant` | Cohere-powered chatbot grounded in live Supabase data |
| Guest Engagement | `/guests` | Loyalty tiers (Gold/Silver/Bronze), customer history |

*(Attach browser screenshots of the above routes to the submitted report.)*

---

## 4. Reflection on the Vibe Coding Experience

**What worked exceptionally well**

Vibe coding collapsed the distance between idea and working software. Describing a feature in plain Vietnamese or English produced a running implementation in minutes — including database writes, real-time subscriptions, i18n strings, and error handling. Tasks that would typically take a junior developer days (e.g., migrating an entire database layer, or rebuilding a dashboard layout) took a single focused session.

The iterative loop was genuinely conversational. Saying *"the floor plan tiles don't stretch to match the alert panel"* was enough — Claude diagnosed the flexbox issue, found the right component, and fixed it without needing a file path or line number. This dramatically lowered the expertise needed to ship UI-quality code.

**What required careful human judgment**

Vibe coding does not replace product thinking. Claude implements what is asked, so the quality of the output is bounded by the quality of the prompt. Vague prompts like *"make the dashboard better"* produced unfocused changes; precise prompts like *"KPI values should center-align, profit numbers show 2 decimal places, remove the Shift Report tab"* produced exactly the right patch.

Several bugs were introduced through over-eager implementation — the inventory deduction used stale React state instead of fresh Supabase data, causing potential over-deduction under concurrent orders. Catching this required manually reasoning about race conditions, something Claude only fixed after the problem was explicitly named.

**On trust and verification**

Every Claude-generated commit was tested in the live Vercel URL before the next prompt. This discipline was essential — a few commits silently broke unrelated features (e.g., a layout refactor that broke the Consultant's height calculation). Treating the live URL as the ground truth, not the local build, caught regressions quickly.

**Overall**

Vibe coding with Claude Code is best described as *pair programming where your partner never tires, never loses context within a session, and has read every relevant framework doc* — but still needs a human to set direction, catch edge cases, and decide what the product should actually do. For a student project of this scope (full-stack, bilingual, real-time, AI-integrated, deployed), it would have been practically impossible to ship in 8 days without it.
