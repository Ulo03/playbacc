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
	const intervalRef = useRef<number | null>(null)
	const isConnectedRef = useRef(isConnected)

	// Keep ref in sync with state
	useEffect(() => {
		isConnectedRef.current = isConnected
	}, [isConnected])

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

	useEffect(() => {
		// Initial check
		checkConnection()

		// Set up polling with dynamic interval
		const startPolling = (interval: number) => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
			}
			intervalRef.current = window.setInterval(async () => {
				const connected = await checkConnection()
				// Adjust interval if connection status changed
				const newInterval = connected
					? HEALTH_CHECK_INTERVAL_CONNECTED
					: HEALTH_CHECK_INTERVAL
				if (
					(connected && interval !== HEALTH_CHECK_INTERVAL_CONNECTED) ||
					(!connected && interval !== HEALTH_CHECK_INTERVAL)
				) {
					startPolling(newInterval)
				}
			}, interval)
		}

		// Start with appropriate interval based on initial assumed state
		startPolling(HEALTH_CHECK_INTERVAL_CONNECTED)

		// Check when page becomes visible
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				checkConnection()
			}
		}

		// Check when coming back online
		const handleOnline = () => {
			checkConnection()
		}

		const handleOffline = () => {
			setIsConnected(false)
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('online', handleOnline)
		window.addEventListener('offline', handleOffline)

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
			}
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		}
	}, [checkConnection])

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
