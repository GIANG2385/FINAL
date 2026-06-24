import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t, i18n } = useTranslation()

  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--pp-text)', marginBottom: '24px' }}>{t('nav.settings')}</h1>

      <div style={{ background: 'var(--pp-card-bg)', border: '1px solid var(--pp-border)', borderRadius: '10px', padding: '20px', maxWidth: '400px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>{t('settings.language')}</label>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{ border: '1px solid var(--pp-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: 'white', cursor: 'pointer' }}
          >
            <option value="vi">🇻🇳 Tiếng Việt</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--pp-text-muted)', background: 'var(--pp-yellow)', border: '1px solid var(--pp-yellow-border)', borderRadius: '8px', padding: '10px 12px', margin: 0 }}>
          💡 {i18n.language === 'vi'
            ? 'Bạn cũng có thể chuyển ngôn ngữ nhanh bằng nút VI/EN trên thanh điều hướng.'
            : 'Tip: You can also switch language quickly using the VI/EN button in the top navigation bar.'}
        </p>
      </div>
    </div>
  )
}
