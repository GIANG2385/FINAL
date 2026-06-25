import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { listInsights, acknowledgeInsight, runAnalysisInternal } from '../controllers/insightsController.js'

const router = Router()

router.get('/', requireAuth, listInsights)
router.post('/run', requireAuth, async (req, res) => {
  try {
    const count = await runAnalysisInternal()
    res.json({ created: count })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
router.post('/:id/acknowledge', requireAuth, acknowledgeInsight)

export default router
