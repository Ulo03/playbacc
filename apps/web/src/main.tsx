import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../i18n'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth'
import { ApiStatusProvider } from '@/hooks/use-api-status'
import { ConnectionStatus } from '@/components/connection-status'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ThemeProvider>
			<ApiStatusProvider>
				<ConnectionStatus />
				<AuthProvider>
					<App />
				</AuthProvider>
			</ApiStatusProvider>
		</ThemeProvider>
	</StrictMode>
)
