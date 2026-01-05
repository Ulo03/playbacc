import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Palette, Disc3 } from 'lucide-react'
import spotifyLogo from '@/assets/spotify.svg'

interface CurrentlyPlayingTrack {
	id: string
	name: string
	duration_ms: number
	explicit: boolean
	album: {
		id: string
		name: string
		images: Array<{ url: string; height: number; width: number }>
	}
	artists: Array<{ id: string; name: string }>
}

interface CurrentlyPlayingResponse {
	playing: boolean
	is_playing?: boolean
	progress_ms?: number
	track?: CurrentlyPlayingTrack
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function DashboardPage() {
	const { user, token, logout } = useAuth()
	const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlayingResponse | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	
	// Local progress state for smooth animation
	const [localProgress, setLocalProgress] = useState(0)
	const lastFetchTime = useRef<number>(Date.now())

	const fetchCurrentlyPlaying = useCallback(async () => {
		if (!token) return

		try {
			setError(null)
			const response = await fetch(`${API_URL}/api/player/currently-playing`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				throw new Error('Failed to fetch currently playing')
			}

			const data = await response.json()
			setCurrentlyPlaying(data)
			
			// Reset local progress to fetched progress
			if (data.playing && data.progress_ms !== undefined) {
				setLocalProgress(data.progress_ms)
				lastFetchTime.current = Date.now()
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setIsLoading(false)
		}
	}, [token])

	useEffect(() => {
		fetchCurrentlyPlaying()

		// Poll every 10 seconds
		const interval = setInterval(fetchCurrentlyPlaying, 10000)
		return () => clearInterval(interval)
	}, [fetchCurrentlyPlaying])

	// Animate progress every second when playing
	useEffect(() => {
		if (!currentlyPlaying?.playing || !currentlyPlaying?.is_playing || !currentlyPlaying?.track) {
			return
		}

		const interval = setInterval(() => {
			setLocalProgress(prev => {
				const newProgress = prev + 1000
				// Don't exceed track duration
				if (newProgress >= currentlyPlaying.track!.duration_ms) {
					return currentlyPlaying.track!.duration_ms
				}
				return newProgress
			})
		}, 1000)

		return () => clearInterval(interval)
	}, [currentlyPlaying?.playing, currentlyPlaying?.is_playing, currentlyPlaying?.track])

	const formatDuration = (ms: number) => {
		const minutes = Math.floor(ms / 60000)
		const seconds = Math.floor((ms % 60000) / 1000)
		return `${minutes}:${seconds.toString().padStart(2, '0')}`
	}

	const progressPercent = currentlyPlaying?.playing && currentlyPlaying.track
		? (localProgress / currentlyPlaying.track.duration_ms) * 100
		: 0

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

						<Button variant="ghost" className="hover:cursor-pointer" size="sm" onClick={logout}>
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

				<Card className="max-w-md">
					<CardContent className="">
						{error ? (
							<p className="text-sm text-destructive">{error}</p>
						) : isLoading && !currentlyPlaying ? (
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 bg-muted animate-pulse" />
								<div className="flex-1 space-y-2">
									<div className="h-4 bg-muted animate-pulse w-3/4" />
									<div className="h-3 bg-muted animate-pulse w-1/2" />
								</div>
							</div>
						) : currentlyPlaying?.playing && currentlyPlaying.track ? (
							<div className="space-y-3">
								<div className="flex items-center gap-3">
									{currentlyPlaying.track.album.images[0] ? (
										<img
											src={currentlyPlaying.track.album.images[0].url}
											alt={currentlyPlaying.track.album.name}
											className="w-12 h-12 object-cover"
										/>
									) : (
										<div className="w-12 h-12 bg-muted flex items-center justify-center">
											<Disc3 className="size-6 text-muted-foreground" />
										</div>
									)}
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate">
											{currentlyPlaying.track.name}
										</p>
										<p className="text-xs text-muted-foreground truncate">
											{currentlyPlaying.track.artists.map(a => a.name).join(', ')}
										</p>
									</div>
									{currentlyPlaying.is_playing && (
										<img src={spotifyLogo} alt="Playing on Spotify" className="size-5 shrink-0" />
									)}
								</div>
								<div className="space-y-1">
									<div className="h-1 bg-muted overflow-hidden">
										<div 
											className="h-full bg-foreground/50 transition-all duration-1000"
											style={{ width: `${progressPercent}%` }}
										/>
									</div>
									<div className="flex justify-between text-xs text-muted-foreground">
										<span>{formatDuration(localProgress)}</span>
										<span>{formatDuration(currentlyPlaying.track.duration_ms)}</span>
									</div>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3 text-muted-foreground">
								<div className="w-12 h-12 bg-muted/50 flex items-center justify-center">
									<Disc3 className="size-6" />
								</div>
								<p className="text-sm">Nothing playing right now</p>
							</div>
						)}
					</CardContent>
				</Card>
			</main>
		</div>
	)
}
