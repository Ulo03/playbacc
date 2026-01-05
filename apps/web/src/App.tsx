import { RouterProvider } from '@tanstack/react-router'
import { router } from '@/router'
import { useAuth } from '@/lib/auth'

function InnerApp() {
	const { isAuthenticated, isLoading } = useAuth()

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin" />
			</div>
		)
	}

	return <RouterProvider router={router} context={{ isAuthenticated }} />
}

export function App() {
	return <InnerApp />
}

export default App
