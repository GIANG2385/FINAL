import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t, i18n } = useTranslation()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>
      <div className="mt-4">
        <label className="mr-2 font-medium">{t('settings.language')}</label>
        <select
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  )
}
