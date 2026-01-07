import { useApiStatus } from '@/hooks/use-api-status'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'

export function ConnectionStatus() {
	const { isConnected, isChecking } = useApiStatus()
	const { t } = useTranslation()

	// Don't show anything while doing initial check or when connected
	if (isChecking || isConnected) {
		return null
	}

	return (
		<div className="fixed inset-0 z-[9999] pointer-events-none flex items-end justify-center p-4 sm:items-start sm:justify-end">
			<div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-destructive text-destructive-foreground shadow-lg ring-1 ring-black ring-opacity-5">
				<div className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex-shrink-0">
							<WifiOff className="h-5 w-5" aria-hidden="true" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium">
								{t('connection.title', 'Connection Lost')}
							</p>
							<p className="mt-1 text-sm opacity-90">
								{t(
									'connection.message',
									'Unable to connect to the server. Reconnecting automatically...'
								)}
							</p>
						</div>
						<div className="flex-shrink-0">
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
