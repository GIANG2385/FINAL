import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t, i18n } = useTranslation()

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{t('nav.settings')}</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Preferences &amp; configuration</p>
      </div>

      <div style={{ background: 'white', border: '1px solid #E5E5EA', borderRadius: '12px', padding: '20px', maxWidth: '420px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '8px', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settings.language')}</label>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{ border: '1px solid #E5E5EA', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', background: 'white', cursor: 'pointer', outline: 'none' }}
          >
            <option value="vi">🇻🇳 Tiếng Việt</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>

        <div style={{ background: '#FFFBEB', border: '1px solid #F5D878', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#92400E' }}>
          💡 {i18n.language === 'vi'
            ? 'Bạn cũng có thể chuyển ngôn ngữ nhanh bằng nút VI/EN ở thanh trên cùng.'
            : 'Tip: Use the VI/EN toggle in the top bar to switch language from any page.'}
        </div>
      </div>
    </div>
  )
}
