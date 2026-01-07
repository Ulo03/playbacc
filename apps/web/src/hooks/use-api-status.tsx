import {
	useState,
	useEffect,
	useCallback,
	useRef,
	createContext,
	useContext,
	type ReactNode,
} from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const HEALTH_CHECK_INTERVAL = 5000 // Check every 5 seconds when disconnected
const HEALTH_CHECK_INTERVAL_CONNECTED = 30000 // Check every 30 seconds when connected

interface ApiStatusContextValue {
	isConnected: boolean
	isChecking: boolean
}

const ApiStatusContext = createContext<ApiStatusContextValue | null>(null)

export function ApiStatusProvider({ children }: { children: ReactNode }) {
	const [isConnected, setIsConnected] = useState(true)
	const [isChecking, setIsChecking] = useState(true)
	const timeoutRef = useRef<number | null>(null)

	const checkConnection = useCallback(async () => {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000)

			const response = await fetch(API_URL, {
				method: 'GET',
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			const connected = response.ok
			setIsConnected(connected)
			return connected
		} catch {
			setIsConnected(false)
			return false
		} finally {
			setIsChecking(false)
		}
	}, [])

	const scheduleNextCheck = useCallback(
		(connected: boolean) => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
			const interval = connected
				? HEALTH_CHECK_INTERVAL_CONNECTED
				: HEALTH_CHECK_INTERVAL
			timeoutRef.current = window.setTimeout(async () => {
				const result = await checkConnection()
				scheduleNextCheck(result)
			}, interval)
		},
		[checkConnection]
	)

	useEffect(() => {
		// Initial check and start polling
		checkConnection().then(scheduleNextCheck)

		// Check when page becomes visible
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				checkConnection().then(scheduleNextCheck)
			}
		}

		// Check when coming back online
		const handleOnline = () => {
			checkConnection().then(scheduleNextCheck)
		}

		const handleOffline = () => {
			setIsConnected(false)
			scheduleNextCheck(false)
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('online', handleOnline)
		window.addEventListener('offline', handleOffline)

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			)
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		}
	}, [checkConnection, scheduleNextCheck])

	return (
		<ApiStatusContext.Provider value={{ isConnected, isChecking }}>
			{children}
		</ApiStatusContext.Provider>
	)
}

export function useApiStatus() {
	const context = useContext(ApiStatusContext)
	if (!context) {
		throw new Error('useApiStatus must be used within an ApiStatusProvider')
	}
	return context
}
