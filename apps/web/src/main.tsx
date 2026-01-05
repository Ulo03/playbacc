import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../i18n'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ThemeProvider>
			<AuthProvider>
				<App />
			</AuthProvider>
		</ThemeProvider>
	</StrictMode>
)
