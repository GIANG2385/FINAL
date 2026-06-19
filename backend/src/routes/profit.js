import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { getProfitSummary } from '../controllers/profitController.js'

const router = Router()

router.get('/summary', requireAuth, getProfitSummary)

export default router
