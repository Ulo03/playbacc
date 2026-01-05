import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from 'react'

export interface User {
	id: string
	email: string
	username: string | null
	image_url?: string | null
}

interface AuthContextType {
	user: User | null
	token: string | null
	isLoading: boolean
	isAuthenticated: boolean
	login: () => void
	logout: () => void
	handleCallback: (token: string, userBase64: string) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const TOKEN_KEY = 'playbacc_token'
const USER_KEY = 'playbacc_user'

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [token, setToken] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	// Load stored auth on mount
	useEffect(() => {
		const storedToken = localStorage.getItem(TOKEN_KEY)
		const storedUser = localStorage.getItem(USER_KEY)

		if (storedToken && storedUser) {
			setToken(storedToken)
			setUser(JSON.parse(storedUser))
		}

		setIsLoading(false)
	}, [])

	const login = useCallback(() => {
		// Build the callback URL for this frontend
		const callbackUrl = `${window.location.origin}/callback`
		
		// Redirect to the API login endpoint with our callback URL
		const loginUrl = `${API_URL}/api/auth/spotify/login?redirect_uri=${encodeURIComponent(callbackUrl)}`
		window.location.href = loginUrl
	}, [])

	const handleCallback = useCallback((token: string, userBase64: string) => {
		try {
			const user = JSON.parse(atob(userBase64.replace(/-/g, '+').replace(/_/g, '/')))
			
			localStorage.setItem(TOKEN_KEY, token)
			localStorage.setItem(USER_KEY, JSON.stringify(user))
			setToken(token)
			setUser(user)
		} catch (error) {
			console.error('Failed to parse user data:', error)
			throw new Error('Invalid user data')
		}
	}, [])

	const logout = useCallback(() => {
		localStorage.removeItem(TOKEN_KEY)
		localStorage.removeItem(USER_KEY)
		setToken(null)
		setUser(null)
	}, [])

	return (
		<AuthContext.Provider
			value={{
				user,
				token,
				isLoading,
				isAuthenticated: !!token && !!user,
				login,
				logout,
				handleCallback,
			}}
		>
			{children}
		</AuthContext.Provider>
	)
}

export function useAuth() {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}
