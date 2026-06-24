import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { sendMessage, clearMessages } from '../controllers/consultantController.js'

const router = Router()

router.post('/messages', requireAuth, sendMessage)
router.delete('/messages', requireAuth, clearMessages)

export default router
