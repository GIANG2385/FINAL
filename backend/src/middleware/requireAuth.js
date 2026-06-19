// Verifies a Firebase ID token sent as `Authorization: Bearer <token>`.
import { auth } from '../firebaseAdmin.js'

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  if (!auth) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' })
  }

  try {
    req.user = await auth.verifyIdToken(token)
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
