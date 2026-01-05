import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function CallbackPage() {
	const navigate = useNavigate()
	const search = useSearch({ from: '/callback' })
	const { handleCallback } = useAuth()
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const processCallback = () => {
			const token = search.token as string | undefined
			const user = search.user as string | undefined
			const errorParam = search.error as string | undefined

			if (errorParam) {
				setError(errorParam === 'access_denied' 
					? 'Access was denied. Please try again.'
					: errorParam)
				return
			}

			if (!token || !user) {
				setError('Missing authentication data')
				return
			}

			try {
				handleCallback(token, user)
				navigate({ to: '/' })
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Authentication failed')
			}
		}

		processCallback()
	}, [search, handleCallback, navigate])

	if (error) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center p-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
							<svg
								className="w-6 h-6 text-destructive"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</div>
						<CardTitle>Authentication Failed</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							onClick={() => navigate({ to: '/login' })}
							className="w-full"
							variant="outline"
						>
							Back to Login
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
						{/* Animated spinner */}
						<div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-foreground rounded-full animate-spin" />
					</div>
					<CardTitle>Authenticating</CardTitle>
					<CardDescription>
						Completing sign in...
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	)
}
