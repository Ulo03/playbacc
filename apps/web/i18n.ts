import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import translation from './locales/en/translation.json'

// Default namespace
export const defaultNS = 'translation'

// Resources
export const resources = {
	en: {
		translation,
	},
} as const

// Initialize i18n
i18n.use(initReactI18next)
	.use(LanguageDetector)
	.init({
		lng: 'en',
		fallbackLng: 'en',
		interpolation: {
			escapeValue: false,
		},
		ns: ['translation'],
		defaultNS,
		resources,
	})
