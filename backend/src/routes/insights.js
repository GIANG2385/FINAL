import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { listInsights, acknowledgeInsight } from '../controllers/insightsController.js'

const router = Router()

router.get('/', requireAuth, listInsights)
router.post('/:id/acknowledge', requireAuth, acknowledgeInsight)

export default router
