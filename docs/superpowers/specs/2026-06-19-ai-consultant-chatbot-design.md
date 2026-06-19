# AI Operations Consultant Chatbot — Design

## Purpose

Add a chatbot to Pang Pang SmartOps AI that acts as an AI Operations Consultant for the restaurant owner: a conversational interface to ask questions about *why* things are happening in the business (e.g. "why is revenue down today?", "what should I worry about right now?") and get answers grounded in the app's real live data.

This is an explicit, user-requested exception to the build instructions' §10 ("do not call external LLM APIs unless the user explicitly asks") — the owner asked for real OpenAI integration for this one feature. Every other "AI" feature in the app (root cause engine, risk forecast, recommendations) remains the existing rule-based/templated logic; this chatbot is the first and only feature calling an external LLM.

## Scope decisions (from brainstorming)

- **Purpose:** AI Operations Consultant for the owner — explains root causes behind business numbers, not a general FAQ/help-desk bot.
- **Data grounding:** Required. Every answer must be grounded in real live data (today's revenue/profit, at-risk inventory, active AI insights), not generic conversation.
- **Data fetching strategy:** Fixed snapshot per turn (not OpenAI function calling/tools). The backend gathers a compact data summary before every message and includes it in the prompt context. Chosen for MVP simplicity, consistent with this project's vertical-slice-first approach. Function calling is a possible future enhancement, not in scope now.
- **Placement:** Dedicated page (`/consultant`), reached via the nav bar — not a floating widget.
- **Access control:** Manager/admin only, matching the existing role-gated pattern used for `insights.acknowledge`.
- **Persistence:** Conversations are saved to Firestore per user, so the owner can return and see past conversations (not session-only).
- **Language:** Bot always replies in English only, regardless of the app's active UI language (vi/en) or the language the question was asked in. (Decision: simplicity over full bilingual parity for this one feature — every other AI-generated string in the app is bilingual via templates, but freeform LLM output is not templated, so full bilingual support would require asking the model to produce both languages every turn; out of scope for this iteration.)
- **OpenAI account:** Owner already has an API key — implementation/instructions skip account creation, start from key configuration.

## Architecture

### Backend (new files)

- `backend/src/services/openaiClient.js` — thin wrapper around the OpenAI SDK (`openai` npm package), reads `OPENAI_API_KEY` from env, exports a function to send a chat completion request. Model: `gpt-4o-mini` by default (cost-effective, sufficient for grounded Q&A over a small data snapshot), overridable via an `OPENAI_MODEL` env var if the owner wants a different model later.
- `backend/src/controllers/consultantController.js`:
  - `sendMessage(req, res)` — handles `POST /api/consultant/messages`. Role-checks the caller (manager/admin only, same Firestore `users/{uid}.role` lookup pattern as `acknowledgeInsight`), saves the user's message, builds the data snapshot, calls OpenAI, saves and returns the assistant's reply.
  - `buildDataSnapshot()` — internal helper, reuses existing logic from `inventoryController` (at-risk items) and `profitController` (today's revenue/profit), plus a query of active (`status != 'acted_on'`) `insights` docs. Returns a compact plain-text or structured summary for the system prompt.
- `backend/src/routes/consultant.js` — mounts `POST /api/consultant/messages` under `requireAuth`.
- `backend/server.js` — mount the new router at `/api/consultant`.

### Data model (new Firestore collection)

```
consultant_conversations/{uid}/messages/{messageId}
  {
    role: "user" | "assistant",
    content: string,
    created_at: timestamp
  }
```

Scoped as a per-user subcollection (not a top-level collection with a `uid` field) so Firestore security rules are simple: a user can only read/write documents under their own `uid` path. Add to `firestore.rules`:

```
match /consultant_conversations/{userId}/messages/{messageId} {
  allow read, write: if isSignedIn() && request.auth.uid == userId;
}
```

(Role-gating to manager/admin happens at the app level in the backend controller, same as `acknowledgeInsight` — Firestore rules here only need to enforce per-user isolation, since the backend already enforces the role check before ever writing.)

### Frontend (new files)

- `frontend/src/pages/Consultant.jsx` — chat UI: message list (read live via `onSnapshot` on `consultant_conversations/{uid}/messages`, ordered by `created_at`), text input, send button. Calls `api.post('/api/consultant/messages', { message })`.
- `App.jsx` — new `/consultant` route wrapped in `ProtectedRoute`, plus a role-gated nav link (only rendered when `role === 'manager' || role === 'admin'`, mirroring how the role badge is already conditionally shown).
- i18n: only the *static* UI chrome (page title, input placeholder, send button) gets `consultant.*` keys in both locale files — the bot's actual message content is English-only per the language decision above and is never passed through `t()`.

## Data flow (per message)

1. Owner types a question on `/consultant` → frontend calls `POST /api/consultant/messages` with `{ message }` (Firebase ID token attached via the existing `api.js` wrapper).
2. Backend verifies the token (`requireAuth`) and the caller's role (manager/admin only — 403 otherwise).
3. Backend writes the user's message to `consultant_conversations/{uid}/messages`.
4. Backend calls `buildDataSnapshot()` to gather today's revenue/profit, at-risk inventory items, and active insights.
5. Backend sends OpenAI a system prompt ("You are an AI Operations Consultant for Pang Pang Restaurant. Answer only in English. Here is today's data: {snapshot}") plus the last ~10 messages of conversation history plus the new question.
6. Backend writes the assistant's reply to Firestore and returns it in the response.
7. Frontend's `onSnapshot` listener picks up both the new user message and the assistant reply in real time and renders them.

## Error handling

- Missing `OPENAI_API_KEY` at startup → `openaiClient.js` logs a warning (same pattern as `firebaseAdmin.js`'s missing-service-account warning); the endpoint returns 500 if called while unconfigured.
- OpenAI API failure (rate limit, network, bad key, timeout) → backend catches, returns 502 with a generic error message; frontend shows an inline error state in the chat (same red-text pattern used elsewhere after the step-11 polish pass), input stays enabled so the owner can retry.
- Non-manager/admin caller → 403, frontend never renders the nav link or route content for other roles (`ProtectedRoute` + conditional nav, consistent with existing role-gating), so this is mostly a defense-in-depth backend check.

## Testing

Consistent with how every other feature in this build was verified — no automated test suite, manual verification via Playwright against the real dev servers:
- Send a real question (e.g. "why is revenue down today?") and confirm the reply references actual seeded numbers, not generic text.
- Refresh the page and confirm the conversation persists (read from Firestore).
- Confirm a `staff`-role test user cannot see the nav link and gets a 403 if hitting the endpoint directly.
- Confirm the missing-API-key warning appears in backend logs if `OPENAI_API_KEY` is unset, and the endpoint fails gracefully rather than crashing the server.
