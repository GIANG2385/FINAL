import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { createOrder, updateOrderStatus } from '../controllers/ordersController.js'

const router = Router()

router.post('/', requireAuth, createOrder)
router.patch('/:id/status', requireAuth, updateOrderStatus)

export default router
