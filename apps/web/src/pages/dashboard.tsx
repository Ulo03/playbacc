import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useApiStatus } from '@/hooks/use-api-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ThemeSelectorModal } from '@/components/theme-selector-modal'
import { Disc3, Users, User, Clock, Music } from 'lucide-react'
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

interface RecentlyPlayedTrack {
	played_at: string
	track: {
		id: string
		name: string
		duration_ms: number
		explicit: boolean
		album: {
			id: string
			name: string
			images?: Array<{ url: string }>
		}
		artists: Array<{ id: string; name: string }>
	}
}

interface RecentlyPlayedResponse {
	items: RecentlyPlayedTrack[]
}

interface TopArtist {
	id: string
	name: string
	image_url: string | null
	play_count: number
	total_ms: number
}

interface TopArtistsResponse {
	items: TopArtist[]
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function DashboardPage() {
	const { user, token, logout } = useAuth()
	const { isConnected } = useApiStatus()
	const [currentlyPlaying, setCurrentlyPlaying] =
		useState<CurrentlyPlayingResponse | null>(null)
	const [recentlyPlayed, setRecentlyPlayed] =
		useState<RecentlyPlayedResponse | null>(null)
	const [topGroups, setTopGroups] = useState<TopArtistsResponse | null>(null)
	const [topSoloArtists, setTopSoloArtists] =
		useState<TopArtistsResponse | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isLoadingRecent, setIsLoadingRecent] = useState(true)
	const [isLoadingTopArtists, setIsLoadingTopArtists] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Progress tracking - store base progress from API and calculate current progress
	const [baseProgress, setBaseProgress] = useState(0)
	const [displayTime, setDisplayTime] = useState(0) // Only for time text display
	const lastFetchTime = useRef<number>(performance.now())
	const previousTrackId = useRef<string | null>(null)
	const progressBarRef = useRef<HTMLDivElement>(null)
	const isConnectedRef = useRef(isConnected)

	// Keep ref in sync with state
	useEffect(() => {
		isConnectedRef.current = isConnected
	}, [isConnected])

	const fetchCurrentlyPlaying = useCallback(async () => {
		if (!token || !isConnectedRef.current) return

		try {
			setError(null)
			const response = await fetch(
				`${API_URL}/api/player/currently-playing`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			)

			if (!response.ok) {
				throw new Error('Failed to fetch currently playing')
			}

			const data = await response.json()
			setCurrentlyPlaying(data)

			// Reset progress to fetched progress
			if (data.playing && data.progress_ms !== undefined) {
				setBaseProgress(data.progress_ms)
				setDisplayTime(data.progress_ms)
				lastFetchTime.current = performance.now()
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setIsLoading(false)
		}
	}, [token])

	const fetchRecentlyPlayed = useCallback(async () => {
		if (!token || !isConnectedRef.current) return

		try {
			const response = await fetch(
				`${API_URL}/api/player/recently-played?limit=10`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				}
			)

			if (!response.ok) {
				throw new Error('Failed to fetch recently played')
			}

			const data = await response.json()
			setRecentlyPlayed(data)
		} catch (err) {
			console.error('Error fetching recently played:', err)
		} finally {
			setIsLoadingRecent(false)
		}
	}, [token])

	const fetchTopArtists = useCallback(async () => {
		if (!token || !isConnectedRef.current) return

		try {
			const [groupsRes, soloRes] = await Promise.all([
				fetch(`${API_URL}/api/stats/top-groups`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${API_URL}/api/stats/top-solo-artists`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
			])

			if (groupsRes.ok) {
				const data = await groupsRes.json()
				setTopGroups(data)
			}

			if (soloRes.ok) {
				const data = await soloRes.json()
				setTopSoloArtists(data)
			}
		} catch (err) {
			console.error('Error fetching top artists:', err)
		} finally {
			setIsLoadingTopArtists(false)
		}
	}, [token])

	useEffect(() => {
		fetchCurrentlyPlaying()
		fetchRecentlyPlayed()
		fetchTopArtists()

		// Poll currently playing every 5 seconds for faster track change detection
		const interval = setInterval(fetchCurrentlyPlaying, 5000)
		// Poll recently played every 30 seconds
		const recentInterval = setInterval(fetchRecentlyPlayed, 30000)

		// Refresh when page becomes visible (user returns to tab)
		const handleVisibilityChange = () => {
			if (
				document.visibilityState === 'visible' &&
				isConnectedRef.current
			) {
				fetchCurrentlyPlaying()
				fetchRecentlyPlayed()
			}
		}
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			clearInterval(interval)
			clearInterval(recentInterval)
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			)
		}
	}, [fetchCurrentlyPlaying, fetchRecentlyPlayed, fetchTopArtists])

	// Refresh data when connection is restored
	useEffect(() => {
		if (isConnected) {
			fetchCurrentlyPlaying()
			fetchRecentlyPlayed()
			fetchTopArtists()
		}
	}, [
		isConnected,
		fetchCurrentlyPlaying,
		fetchRecentlyPlayed,
		fetchTopArtists,
	])

	// Detect track changes and refresh recently played
	useEffect(() => {
		const currentTrackId = currentlyPlaying?.track?.id ?? null

		if (
			previousTrackId.current !== null &&
			currentTrackId !== previousTrackId.current
		) {
			// Track changed (skip or natural end) - refresh recently played after delays
			// Spotify API can take a few seconds to update, so we poll multiple times
			const delays = [1000, 2500, 5000, 8000]
			delays.forEach((delay) => {
				setTimeout(() => {
					fetchRecentlyPlayed()
				}, delay)
			})
		}

		previousTrackId.current = currentTrackId
	}, [currentlyPlaying?.track?.id, fetchRecentlyPlayed])

	// Animate progress smoothly using requestAnimationFrame
	useEffect(() => {
		if (
			!currentlyPlaying?.playing ||
			!currentlyPlaying?.is_playing ||
			!currentlyPlaying?.track
		) {
			return
		}

		const trackDuration = currentlyPlaying.track.duration_ms
		let animationId: number
		let hasTriggeredEndFetch = false
		let lastTimeUpdate = 0

		const animate = () => {
			const elapsed = performance.now() - lastFetchTime.current
			const newProgress = Math.min(baseProgress + elapsed, trackDuration)
			const percent = (newProgress / trackDuration) * 100

			// Directly update DOM for smooth animation (no React re-render)
			if (progressBarRef.current) {
				progressBarRef.current.style.width = `${percent}%`
			}

			// Only update time display once per second to avoid excessive re-renders
			const currentSecond = Math.floor(newProgress / 1000)
			if (currentSecond !== lastTimeUpdate) {
				lastTimeUpdate = currentSecond
				setDisplayTime(newProgress)
			}

			// When we reach the end of the song, fetch to check for new track and refresh recently played
			if (newProgress >= trackDuration && !hasTriggeredEndFetch) {
				hasTriggeredEndFetch = true
				setTimeout(() => {
					fetchCurrentlyPlaying()
				}, 1500)
				// Also refresh recently played after song ends
				setTimeout(() => {
					fetchRecentlyPlayed()
				}, 3000)
			}

			if (newProgress < trackDuration) {
				animationId = requestAnimationFrame(animate)
			}
		}

		animationId = requestAnimationFrame(animate)

		return () => cancelAnimationFrame(animationId)
	}, [
		currentlyPlaying?.playing,
		currentlyPlaying?.is_playing,
		currentlyPlaying?.track?.id,
		baseProgress,
		fetchCurrentlyPlaying,
		fetchRecentlyPlayed,
	])

	const formatDuration = (ms: number) => {
		const minutes = Math.floor(ms / 60000)
		const seconds = Math.floor((ms % 60000) / 1000)
		return `${minutes}:${seconds.toString().padStart(2, '0')}`
	}

	const formatPlayedAt = (dateString: string) => {
		const date = new Date(dateString)
		const now = Date.now()
		const diffMs = now - date.getTime()
		const diffSeconds = Math.floor(diffMs / 1000)
		const diffMinutes = Math.floor(diffSeconds / 60)
		const diffHours = Math.floor(diffMinutes / 60)

		if (diffSeconds < 60) {
			return 'just now'
		} else if (diffMinutes < 60) {
			return `${diffMinutes}m ago`
		} else {
			return `${diffHours}h ago`
		}
	}

	const formatListeningTime = (ms: number) => {
		const minutes = Math.floor(ms / 60000)
		if (minutes < 60) return `${minutes} min`
		const hours = Math.floor(minutes / 60)
		const remainingMins = minutes % 60
		if (remainingMins === 0) return `${hours}h`
		return `${hours}h ${remainingMins}min`
	}

	const progressPercent =
		currentlyPlaying?.playing && currentlyPlaying.track
			? (baseProgress / currentlyPlaying.track.duration_ms) * 100
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
						<ThemeSelectorModal />

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
										{user?.username?.[0]?.toUpperCase() ??
											user?.email?.[0]?.toUpperCase()}
									</span>
								</div>
							)}
							<span className="text-sm font-medium hidden sm:inline">
								{user?.username ?? user?.email}
							</span>
						</div>

						<Button
							variant="ghost"
							className="hover:cursor-pointer"
							size="sm"
							onClick={logout}
						>
							Sign out
						</Button>
					</div>
				</div>
			</header>

			{/* Main content */}
			<main className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-2xl font-bold tracking-tight mb-1">
						Welcome back,{' '}
						{user?.username ?? user?.email?.split('@')[0]}
					</h1>
					<p className="text-muted-foreground text-sm">
						Your listening activity dashboard
					</p>
				</div>

				<Card className="max-w-md">
					<CardContent>
						<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
							<Music className="size-4" />
							Now Playing
						</h3>
						{error && isConnected ? (
							<p className="text-sm text-destructive">{error}</p>
						) : !isConnected || (isLoading && !currentlyPlaying) ? (
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 bg-muted animate-pulse" />
								<div className="flex-1 space-y-2">
									<div className="h-4 bg-muted animate-pulse w-3/4" />
									<div className="h-3 bg-muted animate-pulse w-1/2" />
								</div>
							</div>
						) : currentlyPlaying?.playing &&
						  currentlyPlaying.track ? (
							<div className="space-y-3">
								<div className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
									{currentlyPlaying.track.album.images[0] ? (
										<img
											src={
												currentlyPlaying.track.album
													.images[0].url
											}
											alt={
												currentlyPlaying.track.album
													.name
											}
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
											{currentlyPlaying.track.artists
												.map((a) => a.name)
												.join(', ')}
										</p>
									</div>
									{currentlyPlaying.is_playing && (
										<img
											src={spotifyLogo}
											alt="Playing on Spotify"
											className="size-5 shrink-0"
										/>
									)}
								</div>
								<div className="space-y-1">
									<div className="h-1 bg-muted overflow-hidden">
										<div
											ref={progressBarRef}
											className="h-full bg-foreground/50"
											style={{
												width: `${progressPercent}%`,
											}}
										/>
									</div>
									<div className="flex justify-between text-xs text-muted-foreground">
										<span>
											{formatDuration(displayTime)}
										</span>
										<span>
											{formatDuration(
												currentlyPlaying.track
													.duration_ms
											)}
										</span>
									</div>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3 text-muted-foreground">
								<div className="w-12 h-12 bg-muted/50 flex items-center justify-center">
									<Disc3 className="size-6" />
								</div>
								<p className="text-sm">
									Nothing playing right now
								</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Recently Played */}
				<Card className="max-w-md mt-4">
					<CardContent>
						<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
							<Clock className="size-4" />
							Recently Played
						</h3>
						{!isConnected ||
						(isLoadingRecent && !recentlyPlayed) ? (
							<div className="space-y-1">
								{[...Array(10)].map((_, i) => (
									<div
										key={i}
										className="flex items-center gap-3 py-2 -mx-2 px-2"
									>
										<div className="w-10 h-10 bg-muted animate-pulse" />
										<div className="flex-1 space-y-1.5">
											<div className="h-3.5 bg-muted animate-pulse w-3/4" />
											<div className="h-3 bg-muted animate-pulse w-1/2" />
										</div>
										<div className="h-3 w-10 bg-muted animate-pulse shrink-0" />
									</div>
								))}
							</div>
						) : recentlyPlayed?.items &&
						  recentlyPlayed.items.length > 0 ? (
							<div className="space-y-1">
								{recentlyPlayed.items.map((item) => (
									<div
										key={`${item.track.id}-${item.played_at}`}
										className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
									>
										{item.track.album.images?.[0] ? (
											<img
												src={
													item.track.album.images[0]
														.url
												}
												alt={item.track.album.name}
												className="w-10 h-10 object-cover"
											/>
										) : (
											<div className="w-10 h-10 bg-muted flex items-center justify-center">
												<Disc3 className="size-4 text-muted-foreground" />
											</div>
										)}
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium truncate">
												{item.track.name}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{item.track.artists
													.map((a) => a.name)
													.join(', ')}
											</p>
										</div>
										<span className="text-xs text-muted-foreground shrink-0">
											{formatPlayedAt(item.played_at)}
										</span>
									</div>
								))}
							</div>
						) : (
							<div className="flex items-center gap-3 text-muted-foreground py-4">
								<Disc3 className="size-5" />
								<p className="text-sm">No recent plays</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Top Artists Section */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-2xl">
					{/* Top Groups */}
					<Card>
						<CardContent>
							<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
								<Users className="size-4" />
								Top Groups
							</h3>
							{!isConnected ||
							(isLoadingTopArtists && !topGroups) ? (
								<div className="space-y-1">
									{[...Array(5)].map((_, i) => (
										<div
											key={i}
											className="flex items-center gap-3 py-2 -mx-2 px-2"
										>
											<div className="w-4" />
											<div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
											<div className="flex-1 space-y-1.5">
												<div className="h-3.5 bg-muted animate-pulse w-3/4" />
												<div className="h-3 bg-muted animate-pulse w-1/2" />
											</div>
										</div>
									))}
								</div>
							) : topGroups?.items &&
							  topGroups.items.length > 0 ? (
								<div className="space-y-1">
									{topGroups.items.map((artist, index) => (
										<div
											key={artist.id}
											className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
										>
											<span className="text-xs text-muted-foreground w-4 text-right tabular-nums">
												{index + 1}
											</span>
											{artist.image_url ? (
												<img
													src={artist.image_url}
													alt={artist.name}
													className="w-10 h-10 rounded-full object-cover"
												/>
											) : (
												<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
													<Users className="size-4 text-muted-foreground" />
												</div>
											)}
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium truncate">
													{artist.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{artist.play_count} plays ·{' '}
													{formatListeningTime(
														artist.total_ms
													)}
												</p>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex items-center gap-3 text-muted-foreground py-4">
									<Users className="size-5" />
									<p className="text-sm">No groups yet</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Top Solo Artists */}
					<Card>
						<CardContent>
							<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
								<User className="size-4" />
								Top Solo Artists
							</h3>
							{!isConnected ||
							(isLoadingTopArtists && !topSoloArtists) ? (
								<div className="space-y-1">
									{[...Array(5)].map((_, i) => (
										<div
											key={i}
											className="flex items-center gap-3 py-2 -mx-2 px-2"
										>
											<div className="w-4" />
											<div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
											<div className="flex-1 space-y-1.5">
												<div className="h-3.5 bg-muted animate-pulse w-3/4" />
												<div className="h-3 bg-muted animate-pulse w-1/2" />
											</div>
										</div>
									))}
								</div>
							) : topSoloArtists?.items &&
							  topSoloArtists.items.length > 0 ? (
								<div className="space-y-1">
									{topSoloArtists.items.map(
										(artist, index) => (
											<div
												key={artist.id}
												className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
											>
												<span className="text-xs text-muted-foreground w-4 text-right tabular-nums">
													{index + 1}
												</span>
												{artist.image_url ? (
													<img
														src={artist.image_url}
														alt={artist.name}
														className="w-10 h-10 rounded-full object-cover"
													/>
												) : (
													<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
														<User className="size-4 text-muted-foreground" />
													</div>
												)}
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium truncate">
														{artist.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{artist.play_count}{' '}
														plays ·{' '}
														{formatListeningTime(
															artist.total_ms
														)}
													</p>
												</div>
											</div>
										)
									)}
								</div>
							) : (
								<div className="flex items-center gap-3 text-muted-foreground py-4">
									<User className="size-5" />
									<p className="text-sm">
										No solo artists yet
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	)
}
