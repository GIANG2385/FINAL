import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { sendMessage } from '../controllers/consultantController.js'

const router = Router()

router.post('/messages', requireAuth, sendMessage)

export default router
