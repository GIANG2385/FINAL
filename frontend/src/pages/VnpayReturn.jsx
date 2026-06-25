import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function VnpayReturn() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [result, setResult] = useState(null)

  useEffect(() => {
    const query = searchParams.toString()
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/vnpay/verify-return?${query}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ success: false, responseCode: 'error' }))
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '40px 32px', textAlign: 'center', maxWidth: '380px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
        {result === null ? (
          <p style={{ color: '#6B7280' }}>Verifying payment…</p>
        ) : result.success ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>Payment Successful</h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
              Your payment has been received. Please return to your table.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{ background: '#E8002A', color: 'white', border: 'none', borderRadius: '99px', padding: '12px 28px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
            >
              Back to Home
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>❌</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>Payment Failed</h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '8px' }}>Code: {result.responseCode}</p>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
              Please try again or use a different payment method.
            </p>
            <button
              onClick={() => window.close()}
              style={{ background: '#6B7280', color: 'white', border: 'none', borderRadius: '99px', padding: '12px 28px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
