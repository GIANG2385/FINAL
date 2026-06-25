import crypto from 'crypto'
import querystring from 'querystring'
import { Router } from 'express'

const router = Router()

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = obj[k]
    return acc
  }, {})
}

function formatVnDate(date) {
  const d = new Date(date.getTime() + 7 * 60 * 60 * 1000) // UTC+7
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

router.post('/create-payment-url', (req, res) => {
  const { orderId, amount } = req.body
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount required' })
  }

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_Amount: String(Math.round(amount) * 100),
    vnp_CreateDate: formatVnDate(new Date()),
    vnp_CurrCode: 'VND',
    vnp_IpAddr: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TxnRef: orderId,
  }

  const sorted = sortObject(params)
  const signData = querystring.stringify(sorted)
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET)
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

  const paymentUrl = `${process.env.VNPAY_SANDBOX_URL}?${querystring.stringify({ ...sorted, vnp_SecureHash: signed })}`
  res.json({ paymentUrl })
})

router.get('/verify-return', (req, res) => {
  const { vnp_SecureHash, vnp_SecureHashType, ...vnpParams } = req.query

  const sorted = sortObject(vnpParams)
  const signData = querystring.stringify(sorted)
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET)
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

  const isValid = signed === vnp_SecureHash
  const isSuccess = vnpParams.vnp_ResponseCode === '00'

  res.json({
    success: isValid && isSuccess,
    responseCode: vnpParams.vnp_ResponseCode || '',
    orderId: vnpParams.vnp_TxnRef || '',
    amount: vnpParams.vnp_Amount ? Number(vnpParams.vnp_Amount) / 100 : 0,
  })
})

export default router
