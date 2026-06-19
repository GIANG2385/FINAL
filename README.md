# Pang Pang SmartOps AI

Bilingual (EN/VI) AI-powered restaurant operations dashboard for Pang Pang Restaurant. See `PangPang_SmartOps_AI_Build_Instructions.md` for the full spec and `PROGRESS.md` for build history.

## Stack

- **Frontend:** React (Vite), Tailwind CSS, react-router-dom, react-i18next, Firebase Web SDK
- **Backend:** Node.js + Express, Firebase Admin SDK
- **Database/Auth:** Firebase Firestore + Firebase Authentication

## Repo structure

```
frontend/   React app (Vite)
backend/    Express API + AI rule-engine services
firestore.rules   Security rules (deploy via Firebase Console or CLI)
```

## Local development

### 1. Frontend

```
cd frontend
npm install
cp .env.example .env   # fill in real Firebase Web App config
npm run dev             # http://localhost:5173
```

Required env vars (`frontend/.env`):
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE_URL=http://localhost:4000   # backend URL
```

### 2. Backend

```
cd backend
npm install
cp .env.example .env   # fill in PORT + service account JSON
npm run dev             # http://localhost:4000
```

Required env vars (`backend/.env`):
```
PORT=4000
FIREBASE_SERVICE_ACCOUNT=<service account JSON, as a single-line string>
```

Get the service account JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key. **Never commit this file or paste its contents anywhere public.**

### 3. Seed mock data (optional, for demo purposes)

```
cd backend
node src/scripts/seed.js              # orders, inventory, tables, staff_shifts
node src/scripts/seedReservations.js  # reservations (for Guest Engagement)
```

## Deployment

### Frontend → Vercel

1. Push this repo to GitHub.
2. In Vercel, import the repo, set the **root directory to `frontend`**.
3. Build command: `npm run build` (default for Vite). Output directory: `dist` (default).
4. Add the same `VITE_FIREBASE_*` and `VITE_API_BASE_URL` env vars in Vercel's project settings (Settings → Environment Variables) — `VITE_API_BASE_URL` should point to wherever the backend ends up hosted.

### Backend → NOT Vercel

The backend cannot run on Vercel serverless functions as-is: it has a long-running `setInterval` (the scheduled AI-insights job in `backend/src/server.js`) and a persistent Express server, both of which need a process that stays alive — Vercel's serverless model tears down functions between requests.

Suitable hosts: **Render, Railway, Fly.io, or Cloud Run** (Cloud Run was the original suggestion in the build instructions, §2). Whichever you pick:
- Set the same env vars as local (`PORT`, `FIREBASE_SERVICE_ACCOUNT`).
- Update `frontend`'s `VITE_API_BASE_URL` (in Vercel env vars) to the deployed backend URL once it's live.
- Make sure CORS is still permissive enough for the deployed frontend origin (currently `cors()` with no restrictions — fine for now, consider locking down to your Vercel domain for production).

### Firestore security rules

Deploy `firestore.rules` via Firebase Console → Firestore Database → Rules → paste contents → Publish (or `firebase deploy --only firestore:rules` via the Firebase CLI).
