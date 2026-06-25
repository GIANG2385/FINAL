import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import ordersRouter from './routes/orders.js'
import inventoryRouter from './routes/inventory.js'
import profitRouter from './routes/profit.js'
import insightsRouter from './routes/insights.js'
import runAnalysisRouter from './routes/runAnalysis.js'
import consultantRouter from './routes/consultant.js'
import vnpayRouter from './routes/vnpay.js'
import { runAnalysisInternal } from './controllers/insightsController.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/orders', ordersRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/profit', profitRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/run-analysis', runAnalysisRouter)
app.use('/api/consultant', consultantRouter)
app.use('/api/vnpay', vnpayRouter)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})

// "Simulated minutes" per §6 — runs every 60s of wall-clock time so the
// insights feed visibly updates during a demo, rather than every real
// 5-15 minutes as a production deployment would use.
const ANALYSIS_INTERVAL_MS = 60_000
setInterval(() => {
  runAnalysisInternal().catch((err) => console.error('Scheduled analysis failed:', err))
}, ANALYSIS_INTERVAL_MS)
