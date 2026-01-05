import {
	createRouter,
	createRootRouteWithContext,
	createRoute,
	redirect,
	Outlet,
} from '@tanstack/react-router'
import { LoginPage } from '@/pages/login'
import { CallbackPage } from '@/pages/callback'
import { DashboardPage } from '@/pages/dashboard'
import { ThemesPage } from '@/pages/themes'

interface RouterContext {
	isAuthenticated: boolean
}

// Root route
const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
})

// Login route - redirect to home if already authenticated
const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	beforeLoad: ({ context }) => {
		if (context.isAuthenticated) {
			throw redirect({ to: '/' })
		}
	},
	component: LoginPage,
})

// Callback route - handles OAuth callback redirect from API
const callbackRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/callback',
	validateSearch: (search: Record<string, unknown>) => ({
		token: search.token as string | undefined,
		user: search.user as string | undefined,
		error: search.error as string | undefined,
	}),
	component: CallbackPage,
})

// Protected dashboard route - redirect to login if not authenticated
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	beforeLoad: ({ context }) => {
		if (!context.isAuthenticated) {
			throw redirect({ to: '/login' })
		}
	},
	component: DashboardPage,
})

// Protected themes route
const themesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/themes',
	beforeLoad: ({ context }) => {
		if (!context.isAuthenticated) {
			throw redirect({ to: '/login' })
		}
	},
	component: ThemesPage,
})

// Route tree
const routeTree = rootRoute.addChildren([loginRoute, callbackRoute, indexRoute, themesRoute])

// Create router
export const router = createRouter({
	routeTree,
	context: {
		isAuthenticated: false,
	},
})

// Register router for type safety
declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
