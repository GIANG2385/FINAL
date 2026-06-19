import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { runAnalysis } from '../controllers/insightsController.js'

const router = Router()

router.post('/', requireAuth, runAnalysis)

export default router
