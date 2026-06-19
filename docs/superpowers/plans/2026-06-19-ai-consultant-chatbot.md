# AI Operations Consultant Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chatbot page where the restaurant owner (manager/admin only) can ask natural-language questions about their business and get answers grounded in real live data, powered by the OpenAI API.

**Architecture:** Backend builds a compact text snapshot of today's revenue, at-risk inventory, and active AI insights on every message, sends it as system-prompt context to OpenAI's Chat Completions API alongside the conversation history, and persists both sides of the conversation to a per-user Firestore subcollection. Frontend is a dedicated `/consultant` page (manager/admin-gated) reading that subcollection live via `onSnapshot`, matching every other page in this app.

**Tech Stack:** Same as the rest of the project — Express + Firebase Admin SDK (backend), React + Firebase Web SDK + react-i18next (frontend). New dependency: `openai` npm package (official OpenAI Node SDK).

## Global Constraints

- Bot replies in **English only**, regardless of UI language or question language (decided in spec — freeform LLM text is not run through the bilingual template system the rest of the app uses).
- Only `manager`/`admin` roles can access the chatbot — same role-check pattern as `acknowledgeInsight` in `backend/src/controllers/insightsController.js`.
- Conversation persists to Firestore at `consultant_conversations/{uid}/messages/{messageId}` — per-user subcollection, not a flat collection with a `uid` field.
- Data grounding is a **fixed snapshot per turn** (today's revenue, at-risk inventory, active insights) — not OpenAI function calling/tools. This is explicitly out of scope per the spec.
- Default model: `gpt-4o-mini`, overridable via `OPENAI_MODEL` env var.
- **No test framework exists in this codebase** (`backend/package.json`'s `test` script is a placeholder; there is no `jest`/`vitest`/`pytest` installed anywhere). Every prior feature in this project was verified via direct `curl`/Node script calls against the real dev servers and real Firebase project, then a Playwright-driven browser check. This plan follows that same established convention — "write the failing test" steps below are real `curl`/Node verification commands run against the actual backend, not a unit test suite. Do not introduce a new test framework as part of this plan.
- This project has **no automated CI** — every verification step in this plan must actually be run by hand against the running dev servers, with real output checked against the expected output shown.

---

## Task 1: OpenAI client wrapper

**Files:**
- Modify: `backend/package.json` (add `openai` dependency via `npm install`)
- Modify: `backend/.env.example` (add `OPENAI_API_KEY`, `OPENAI_MODEL`)
- Create: `backend/src/services/openaiClient.js`

**Interfaces:**
- Produces: `getChatCompletion(messages)` — `messages` is an array of `{ role: 'system'|'user'|'assistant', content: string }`, returns a `Promise<string>` (the assistant's reply text). Throws if `OPENAI_API_KEY` is not configured.

- [ ] **Step 1: Install the OpenAI SDK**

```bash
cd "backend" && npm install openai
```

Expected: `package.json` now lists `openai` under `dependencies`, and `package-lock.json` is updated.

- [ ] **Step 2: Add env vars to `.env.example`**

Open `backend/.env.example` and add two new lines at the end:

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

- [ ] **Step 3: Add your real key to `backend/.env`**

Open `backend/.env` (gitignored, not committed) and add:

```
OPENAI_API_KEY=<your real OpenAI API key>
OPENAI_MODEL=gpt-4o-mini
```

- [ ] **Step 4: Write `backend/src/services/openaiClient.js`**

```js
// Thin wrapper around the OpenAI SDK for the AI Operations Consultant.
// This is the one feature in the app that calls a real external LLM —
// see docs/superpowers/specs/2026-06-19-ai-consultant-chatbot-design.md
// for why this is an explicit, user-requested exception to the
// rule-based-only "AI" approach used everywhere else in the build.
import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

if (!apiKey) {
  console.warn(
    'OPENAI_API_KEY is not set — the AI Consultant endpoint will fail until it is set in backend/.env.'
  )
}

const client = apiKey ? new OpenAI({ apiKey }) : null

export async function getChatCompletion(messages) {
  if (!client) {
    throw new Error('OpenAI client not initialized — OPENAI_API_KEY is missing')
  }
  const completion = await client.chat.completions.create({ model, messages })
  return completion.choices[0].message.content
}
```

- [ ] **Step 5: Verify the client works against the real OpenAI API**

```bash
cd "backend" && node --input-type=module -e "
import 'dotenv/config';
import { getChatCompletion } from './src/services/openaiClient.js';
const reply = await getChatCompletion([
  { role: 'system', content: 'You are a helpful assistant. Answer in exactly 3 words.' },
  { role: 'user', content: 'Say hello.' },
]);
console.log('REPLY:', reply);
"
```

Expected: prints `REPLY: <a short greeting>` with no error. If it prints `OpenAI client not initialized`, the key isn't loaded — check `backend/.env`.

- [ ] **Step 6: Commit**

```bash
cd "backend" && git add package.json package-lock.json .env.example src/services/openaiClient.js
git commit -m "Add OpenAI client wrapper for AI Consultant feature"
```

---

## Task 2: Firestore security rules for conversation storage

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: a `consultant_conversations/{userId}/messages/{messageId}` path that only `userId`'s own authenticated session can read/write.

- [ ] **Step 1: Add the new rule block**

Open `firestore.rules`. Add this block immediately after the existing `match /users/{userId} { ... }` block (so related per-user rules sit together):

```
    match /consultant_conversations/{userId}/messages/{messageId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
```

The full file should now read:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function role() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isManagerOrAdmin() {
      return isSignedIn() && role() in ['manager', 'admin'];
    }

    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == userId;
    }

    match /consultant_conversations/{userId}/messages/{messageId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }

    match /insights/{docId} {
      allow read: if isSignedIn();
      allow write: if isManagerOrAdmin();
    }

    match /inventory/{docId} {
      allow read: if isSignedIn();
      allow write: if isManagerOrAdmin();
    }

    match /staff_shifts/{docId} {
      allow read: if isSignedIn();
      allow write: if isManagerOrAdmin();
    }

    match /orders/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /kitchen_queue/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /tables/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /reservations/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /feedback/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /external_factors/{docId} {
      allow read: if isSignedIn();
      allow write: if isManagerOrAdmin();
    }
  }
}
```

- [ ] **Step 2: Deploy the updated rules**

This requires Firebase Console access (same as every prior rules change in this project — see `PROGRESS.md` step 3 notes). Go to Firebase Console → Firestore Database → Rules → paste the full updated file contents → Publish.

**Stop and confirm with the user that this is published before continuing to Task 5's verification step** — Task 5 will fail with "Missing or insufficient permissions" otherwise, exactly as happened in step 3 of the original build (see `PROGRESS.md`).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "Add Firestore rules for consultant_conversations subcollection"
```

---

## Task 3: Backend data snapshot + chat endpoint

**Files:**
- Create: `backend/src/controllers/consultantController.js`
- Create: `backend/src/routes/consultant.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `db` from `backend/src/firebaseAdmin.js` (Firestore admin instance), `getChatCompletion(messages)` from `backend/src/services/openaiClient.js` (Task 1), `requireAuth` middleware from `backend/src/middleware/requireAuth.js` (sets `req.user.uid` from the verified Firebase ID token).
- Produces: `POST /api/consultant/messages` — body `{ message: string }`, requires `Authorization: Bearer <token>` header, returns `{ reply: string }` on success (200), `400` if `message` missing/empty, `403` if caller's role isn't `manager`/`admin`, `502` if the OpenAI call fails.

- [ ] **Step 1: Write `backend/src/controllers/consultantController.js`**

```js
import { db } from '../firebaseAdmin.js'
import { getChatCompletion } from '../services/openaiClient.js'

const HISTORY_LIMIT = 10

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function isToday(date) {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

async function buildDataSnapshot() {
  const ordersSnap = await db.collection('orders').where('status', '==', 'served').get()
  const revenue = ordersSnap.docs.reduce((sum, doc) => {
    const order = doc.data()
    const servedAt = toDate(order.served_at)
    if (servedAt && isToday(servedAt)) return sum + (order.total_amount || 0)
    return sum
  }, 0)

  const inventorySnap = await db.collection('inventory').get()
  const atRiskItems = inventorySnap.docs
    .map((d) => d.data())
    .map((item) => {
      const hourlyConsumption = (item.avg_daily_consumption || 0) / 24
      const hoursRemaining = hourlyConsumption > 0 ? item.current_stock / hourlyConsumption : null
      return { ...item, hoursRemaining }
    })
    .filter((item) => item.hoursRemaining !== null && item.hoursRemaining <= 6)
    .map(
      (item) =>
        `${item.name_en} (${item.current_stock} ${item.unit} left, ~${Math.round(item.hoursRemaining)}h remaining)`
    )

  const insightsSnap = await db.collection('insights').get()
  const activeInsights = insightsSnap.docs
    .map((d) => d.data())
    .filter((i) => i.status !== 'acted_on')
    .map((i) => i.summary_en)

  return [
    `Today's revenue so far: ${revenue.toLocaleString('en-US')} VND.`,
    atRiskItems.length > 0
      ? `Inventory items at risk of running out soon: ${atRiskItems.join('; ')}.`
      : 'No inventory items currently at risk of stockout.',
    activeInsights.length > 0
      ? `Active AI-generated insights: ${activeInsights.join(' | ')}.`
      : 'No active AI-generated insights right now.',
  ].join('\n')
}

export async function sendMessage(req, res) {
  const { message } = req.body
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  const userDoc = await db.collection('users').doc(req.user.uid).get()
  const role = userDoc.exists ? userDoc.data().role : null
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only manager/admin can use the AI Consultant' })
  }

  const messagesRef = db.collection('consultant_conversations').doc(req.user.uid).collection('messages')

  await messagesRef.add({ role: 'user', content: message, created_at: new Date() })

  const historySnap = await messagesRef.orderBy('created_at', 'desc').limit(HISTORY_LIMIT).get()
  const history = historySnap.docs
    .map((d) => d.data())
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }))

  const snapshot = await buildDataSnapshot()

  let reply
  try {
    reply = await getChatCompletion([
      {
        role: 'system',
        content: `You are an AI Operations Consultant for Pang Pang Restaurant, a Thai casual dining restaurant. Help the owner understand what is happening in their business and why. Answer only in English. Be concise and specific, referencing the data below when relevant.\n\n${snapshot}`,
      },
      ...history,
    ])
  } catch (err) {
    return res.status(502).json({ error: 'AI Consultant is temporarily unavailable' })
  }

  await messagesRef.add({ role: 'assistant', content: reply, created_at: new Date() })

  res.json({ reply })
}
```

- [ ] **Step 2: Write `backend/src/routes/consultant.js`**

```js
import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { sendMessage } from '../controllers/consultantController.js'

const router = Router()

router.post('/messages', requireAuth, sendMessage)

export default router
```

- [ ] **Step 3: Mount the router in `backend/src/server.js`**

Modify `backend/src/server.js` — add the import alongside the other route imports, and the mount alongside the other `app.use` calls:

```js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import ordersRouter from './routes/orders.js'
import inventoryRouter from './routes/inventory.js'
import profitRouter from './routes/profit.js'
import insightsRouter from './routes/insights.js'
import runAnalysisRouter from './routes/runAnalysis.js'
import consultantRouter from './routes/consultant.js'
import { runAnalysisInternal } from './controllers/insightsController.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/orders', ordersRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/profit', profitRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/run-analysis', runAnalysisRouter)
app.use('/api/consultant', consultantRouter)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})

// "Simulated minutes" per §6 — runs every 60s of wall-clock time so the
// insights feed visibly updates during a demo, rather than every real
// 5-15 minutes as a production deployment would use.
const ANALYSIS_INTERVAL_MS = 60_000
setInterval(() => {
  runAnalysisInternal().catch((err) => console.error('Scheduled analysis failed:', err))
}, ANALYSIS_INTERVAL_MS)
```

- [ ] **Step 4: Restart the backend dev server**

```bash
pkill -f "node src/server.js" 2>/dev/null; pkill -f "nodemon src/server.js" 2>/dev/null
cd "backend" && npm run dev > /tmp/backend_dev.log 2>&1 &
sleep 2 && curl -s http://localhost:4000/api/health
```

Expected: `{"status":"ok"}` with no errors in `/tmp/backend_dev.log`.

- [ ] **Step 5: Get a real ID token for a manager/admin test user**

This project already has an admin test user (`hgiang2308@gmail.com`, see `PROGRESS.md` step 3). Get a fresh token via the Firebase Auth REST API:

```bash
cd "frontend" && API_KEY=$(grep VITE_FIREBASE_API_KEY .env | cut -d= -f2)
TOKEN=$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"hgiang2308@gmail.com","password":"123456","returnSecureToken":true}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).idToken))")
echo "$TOKEN" > /tmp/idtoken.txt
echo "token length: ${#TOKEN}"
```

Expected: `token length: <a number around 900>`, not `token length: 0`.

- [ ] **Step 6: Verify the endpoint rejects an empty message**

```bash
TOKEN=$(cat /tmp/idtoken.txt)
curl -s -X POST http://localhost:4000/api/consultant/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message":""}'
```

Expected: `{"error":"message is required"}`

- [ ] **Step 7: Verify the endpoint works end-to-end with a real question**

```bash
TOKEN=$(cat /tmp/idtoken.txt)
curl -s -X POST http://localhost:4000/api/consultant/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"What is today'"'"'s revenue and is anything at risk of running out?"}'
```

Expected: a JSON object `{"reply": "..."}` where the reply text references real numbers (compare against the actual revenue/at-risk items by separately checking `GET /api/profit/summary?range=day` and `GET /api/inventory/forecast` with the same token — the consultant's answer should be consistent with those numbers, not generic).

- [ ] **Step 8: Verify messages were persisted to Firestore**

```bash
cd "backend" && node --input-type=module -e "
import 'dotenv/config';
import { db } from './src/firebaseAdmin.js';
const snap = await db.collection('consultant_conversations').doc('bB6O1L7mPTXVHUmsMr66mVQjgRT2').collection('messages').orderBy('created_at').get();
console.log('message count:', snap.size);
snap.docs.forEach(d => console.log(d.data().role + ':', d.data().content.slice(0, 80)));
"
```

(The UID `bB6O1L7mPTXVHUmsMr66mVQjgRT2` is the existing admin test user's UID from `PROGRESS.md` step 3 — confirm it matches if this UID has changed.)

Expected: `message count: 2` (or more, if run multiple times), alternating `user:` / `assistant:` entries matching what was sent/received in Step 7.

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/consultantController.js backend/src/routes/consultant.js backend/src/server.js
git commit -m "Add AI Consultant chat endpoint with live data grounding"
```

---

## Task 4: Frontend i18n keys

**Files:**
- Modify: `frontend/src/locales/en/translation.json`
- Modify: `frontend/src/locales/vi/translation.json`

**Interfaces:**
- Produces: `nav.consultant`, `consultant.title`, `consultant.placeholder`, `consultant.send`, `consultant.empty`, `consultant.error` translation keys in both locales, consumed by Task 5's `Consultant.jsx` and Task 6's `App.jsx` nav link.

- [ ] **Step 1: Add `nav.consultant` to `frontend/src/locales/en/translation.json`**

Find the `"nav"` block and add `"consultant"` after `"insights"`:

```json
  "nav": {
    "dashboard": "Dashboard",
    "frontOfHouse": "Front of House",
    "backOfHouse": "Back of House",
    "guestEngagement": "Guest Engagement",
    "insights": "Insights",
    "consultant": "AI Consultant",
    "settings": "Settings"
  },
```

- [ ] **Step 2: Add the `"consultant"` top-level block to `frontend/src/locales/en/translation.json`**

Add this new top-level key after the existing `"guest"` block (before the closing `}` of the file):

```json
  "consultant": {
    "title": "AI Consultant",
    "placeholder": "Ask about your business...",
    "send": "Send",
    "empty": "Ask a question to get started.",
    "error": "AI Consultant is temporarily unavailable. Please try again."
  }
```

Remember to add a trailing comma after the `"guest"` block's closing `}` since this is no longer the last key.

- [ ] **Step 3: Add `nav.consultant` to `frontend/src/locales/vi/translation.json`**

```json
  "nav": {
    "dashboard": "Tổng quan",
    "frontOfHouse": "Khu vực phục vụ",
    "backOfHouse": "Khu vực bếp",
    "guestEngagement": "Khách hàng",
    "insights": "Phân tích & Đề xuất",
    "consultant": "Tư vấn AI",
    "settings": "Cài đặt"
  },
```

- [ ] **Step 4: Add the `"consultant"` top-level block to `frontend/src/locales/vi/translation.json`**

```json
  "consultant": {
    "title": "Tư vấn AI",
    "placeholder": "Hỏi về hoạt động kinh doanh của bạn...",
    "send": "Gửi",
    "empty": "Đặt câu hỏi để bắt đầu.",
    "error": "Trợ lý AI tạm thời không khả dụng. Vui lòng thử lại."
  }
```

- [ ] **Step 5: Verify both JSON files are still valid**

```bash
cd "frontend" && node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json')); JSON.parse(require('fs').readFileSync('src/locales/vi/translation.json')); console.log('both valid')"
```

Expected: `both valid` with no error. (A trailing-comma or missing-comma typo is the most likely failure here — fix and re-run until this passes.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales/en/translation.json frontend/src/locales/vi/translation.json
git commit -m "Add i18n keys for AI Consultant chatbot UI chrome"
```

---

## Task 5: Frontend chat page

**Files:**
- Create: `frontend/src/pages/Consultant.jsx`

**Interfaces:**
- Consumes: `useAuth()` from `frontend/src/context/AuthContext.jsx` (provides `user`, `role`), `db` from `frontend/src/services/firebase.js`, `api` from `frontend/src/services/api.js` (Task 3's endpoint), `useTranslation()` from `react-i18next` with the `consultant.*` keys from Task 4.
- Produces: a default-exported `Consultant` React component, used by Task 6's `App.jsx`.

- [ ] **Step 1: Write `frontend/src/pages/Consultant.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Consultant() {
  const { t } = useTranslation()
  const { user, role } = useAuth()
  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'consultant_conversations', user.uid, 'messages'), orderBy('created_at', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user])

  if (role && !['manager', 'admin'].includes(role)) {
    return <Navigate to="/" replace />
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    setError(null)
    const text = input
    setInput('')
    try {
      await api.post('/api/consultant/messages', { message: text })
    } catch (err) {
      setError(t('consultant.error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t('consultant.title')}</h1>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages === null ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500">{t('consultant.empty')}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                'max-w-2xl rounded-lg p-3 text-sm ' +
                (m.role === 'user' ? 'ml-auto bg-purple-600 text-white' : 'bg-gray-100 text-gray-800')
              }
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('consultant.placeholder')}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {t('consultant.send')}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify the frontend still builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```

Expected: `✓ built in <N>ms` with no errors. (This page isn't wired into routing yet, so this just confirms the file itself has no syntax/import errors — Task 6 wires it up.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Consultant.jsx
git commit -m "Add Consultant chat page component"
```

---

## Task 6: Wire route + role-gated nav link

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `Consultant` from `frontend/src/pages/Consultant.jsx` (Task 5), `role` from `useAuth()` (already destructured in this file).

- [ ] **Step 1: Modify `frontend/src/App.jsx`**

Add the import, add a role-gated nav `<Link>`, and add the route. Full resulting file:

```jsx
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Settings from './pages/Settings'
import FrontOfHouse from './pages/FrontOfHouse'
import BackOfHouse from './pages/BackOfHouse'
import Insights from './pages/Insights'
import GuestEngagement from './pages/GuestEngagement'
import Consultant from './pages/Consultant'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { t } = useTranslation()
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div>
      <nav className="flex items-center gap-4 overflow-x-auto whitespace-nowrap border-b border-gray-200 px-6 py-3">
        <span className="shrink-0 font-semibold">{t('app.name')}</span>
        <Link className="shrink-0" to="/">{t('nav.dashboard')}</Link>
        <Link className="shrink-0" to="/foh">{t('nav.frontOfHouse')}</Link>
        <Link className="shrink-0" to="/boh">{t('nav.backOfHouse')}</Link>
        <Link className="shrink-0" to="/guests">{t('nav.guestEngagement')}</Link>
        <Link className="shrink-0" to="/insights">{t('nav.insights')}</Link>
        {role && ['manager', 'admin'].includes(role) && (
          <Link className="shrink-0" to="/consultant">{t('nav.consultant')}</Link>
        )}
        <Link className="shrink-0" to="/settings">{t('nav.settings')}</Link>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {user ? (
            <>
              {role && <span className="text-sm text-gray-500">{role}</span>}
              <button onClick={handleLogout} className="text-sm">
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <Link to="/login">{t('auth.login')}</Link>
          )}
        </div>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route
          path="/foh"
          element={
            <ProtectedRoute>
              <FrontOfHouse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/boh"
          element={
            <ProtectedRoute>
              <BackOfHouse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guests"
          element={
            <ProtectedRoute>
              <GuestEngagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <Insights />
            </ProtectedRoute>
          }
        />
        <Route
          path="/consultant"
          element={
            <ProtectedRoute>
              <Consultant />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}
```

- [ ] **Step 2: Verify the frontend builds**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```

Expected: `✓ built in <N>ms` with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Wire Consultant route and role-gated nav link"
```

---

## Task 7: End-to-end browser verification

**Files:** none (verification only — no new files)

**Interfaces:** none (this task only exercises the system built in Tasks 1-6)

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

Create `/tmp/demo-consultant.mjs`:

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

await page.goto('http://localhost:5173/consultant')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/consultant-01-empty.png' })

await page.fill('input[type="text"]', 'Why might revenue be lower than usual right now?')
await page.click('button[type="submit"]')
await page.waitForTimeout(8000)
await page.screenshot({ path: '/tmp/consultant-02-reply.png' })

const bodyText = await page.textContent('body')
console.log('BODY:', bodyText.replace(/\s+/g, ' '))
console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
```

- [ ] **Step 3: Run it**

```bash
cd /tmp && node demo-consultant.mjs 2>&1
```

Expected: `ERRORS: []` and `BODY:` includes both the user's question and an assistant reply that references real data (not a generic non-answer).

- [ ] **Step 4: Visually confirm via the screenshots**

Read `/tmp/consultant-01-empty.png` (empty chat with input box) and `/tmp/consultant-02-reply.png` (user message + assistant reply both rendered, chat bubbles styled distinctly by role).

- [ ] **Step 5: Verify role-gating — a staff-role user cannot access it**

This requires a staff-role test user. If one doesn't already exist, create one the same way the admin user was created (see `PROGRESS.md` step 3): add a user via Firebase Console → Authentication → Users, then seed their `users/{uid}` doc with `role: 'staff'` via the Admin SDK:

```bash
cd "backend" && node --input-type=module -e "
import 'dotenv/config';
import { auth, db } from './src/firebaseAdmin.js';
const user = await auth.getUserByEmail('<staff test email>');
await db.collection('users').doc(user.uid).set({ uid: user.uid, name: 'Staff Test', role: 'staff', preferred_language: 'vi' });
console.log('seeded staff role for', user.uid);
"
```

Then drive a login as that user and confirm:
1. The "AI Consultant" nav link does not appear.
2. Navigating directly to `http://localhost:5173/consultant` redirects back to `/` (the `Navigate` in `Consultant.jsx` from Task 5).
3. A direct `curl` to `POST /api/consultant/messages` with that user's token returns `403`.

- [ ] **Step 6: Verify conversation persists across a refresh**

In the same Playwright session (or manually in a browser), after sending a message, reload `/consultant` and confirm the prior conversation is still there (proves the Firestore `onSnapshot` read in `Consultant.jsx` is working, not just optimistic local state).

- [ ] **Step 7: Update `PROGRESS.md`**

Add a dated log entry to `PROGRESS.md` (matching the existing style for every other feature in this file) recording: what was built, the deviation from §10 (real OpenAI call), the data-grounding approach, and the verification results from this task. Mark the "AI Consultant chatbot implementation plan not yet written" line in Open Decisions as resolved.

- [ ] **Step 8: Commit**

```bash
git add PROGRESS.md
git commit -m "Verify AI Consultant chatbot end-to-end; update PROGRESS.md"
git push
```
