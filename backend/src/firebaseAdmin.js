// Firebase Admin SDK init.
// Expects FIREBASE_SERVICE_ACCOUNT to be a JSON string (service account key)
// loaded from the environment — never commit the key file itself.
// See PangPang_SmartOps_AI_Build_Instructions.md §8.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

let app = null

if (getApps().length === 0) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    console.warn(
      'FIREBASE_SERVICE_ACCOUNT is not set — firebaseAdmin will not be initialized. ' +
        'Set it in backend/.env once you have a real Firebase service account key.'
    )
  } else {
    const serviceAccount = JSON.parse(raw)
    app = initializeApp({ credential: cert(serviceAccount) })
  }
} else {
  app = getApps()[0]
}

export const db = app ? getFirestore(app) : null
export const auth = app ? getAuth(app) : null
export default app
