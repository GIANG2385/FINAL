import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { getForecast } from '../controllers/inventoryController.js'

const router = Router()

router.get('/forecast', requireAuth, getForecast)

export default router
