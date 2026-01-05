import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Palette } from 'lucide-react'
import spotifyLogo from '@/assets/spotify_black.png'

export function DashboardPage() {
	const { user, logout } = useAuth()

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="border-b border-border">
				<div className="container mx-auto px-4 h-14 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 bg-foreground/5 border border-border flex items-center justify-center">
							<svg
								className="w-4 h-4 text-foreground"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
							>
								<path d="M9 18V5l12-2v13" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
						</div>
						<span className="font-semibold text-sm">playbacc</span>
					</div>

					<div className="flex items-center gap-3">
						<Button variant="ghost" size="icon" asChild>
							<Link to="/themes">
								<Palette className="size-4" />
							</Link>
						</Button>
						
						<div className="flex items-center gap-2 pl-3 border-l border-border">
							{user?.image_url ? (
								<img
									src={user.image_url}
									alt={user.username ?? 'User'}
									className="w-7 h-7 rounded-full object-cover"
								/>
							) : (
								<div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
									<span className="text-xs font-medium">
										{user?.username?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()}
									</span>
								</div>
							)}
							<span className="text-sm font-medium hidden sm:inline">
								{user?.username ?? user?.email}
							</span>
						</div>

						<Button variant="ghost" size="sm" onClick={logout}>
							Sign out
						</Button>
					</div>
				</div>
			</header>

			{/* Main content */}
			<main className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-2xl font-bold tracking-tight mb-1">
						Welcome back, {user?.username ?? user?.email?.split('@')[0]}
					</h1>
					<p className="text-muted-foreground text-sm">
						Your listening activity dashboard
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<img src={spotifyLogo} alt="Spotify" className="w-4 h-4" />
								Spotify Connected
							</CardTitle>
							<CardDescription>
								Your account is linked and syncing
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								Listening history is being tracked automatically.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Recent Scrobbles</CardTitle>
							<CardDescription>Your latest plays</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								No recent scrobbles yet. Start playing music on Spotify!
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Statistics</CardTitle>
							<CardDescription>Your listening stats</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-2xl font-bold">0</p>
									<p className="text-xs text-muted-foreground">Total scrobbles</p>
								</div>
								<div>
									<p className="text-2xl font-bold">0</p>
									<p className="text-xs text-muted-foreground">Artists</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	)
}
