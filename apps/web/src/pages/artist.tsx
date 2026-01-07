import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link, getRouteApi } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Users, User, Calendar } from 'lucide-react'

interface MemberInfo {
	id: string
	name: string
	image_url: string | null
	begin_raw: string | null
	end_raw: string | null
	ended: boolean
}

interface GroupInfo {
	id: string
	name: string
	image_url: string | null
	begin_raw: string | null
	end_raw: string | null
	ended: boolean
}

interface GroupArtistResponse {
	id: string
	name: string
	image_url: string | null
	type: 'group'
	gender: string | null
	begin_date: string | null
	end_date: string | null
	mbid: string | null
	members: {
		current: MemberInfo[]
		previous: MemberInfo[]
	}
}

interface PersonArtistResponse {
	id: string
	name: string
	image_url: string | null
	type: 'person' | string
	gender: string | null
	begin_date: string | null
	end_date: string | null
	mbid: string | null
	groups: GroupInfo[]
}

type ArtistResponse = GroupArtistResponse | PersonArtistResponse

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const routeApi = getRouteApi('/artist/$artistId')

function formatMembershipDates(
	begin_raw: string | null,
	end_raw: string | null,
	ended: boolean
): string {
	if (!begin_raw && !end_raw) {
		return ''
	}

	const beginYear = begin_raw?.slice(0, 4) ?? '?'

	if (ended && end_raw) {
		const endYear = end_raw.slice(0, 4)
		return `${beginYear} - ${endYear}`
	}

	if (begin_raw) {
		return `since ${beginYear}`
	}

	return ''
}

function formatArtistDates(
	type: string | null,
	begin_date: string | null,
	end_date: string | null
): string {
	if (!begin_date && !end_date) return ''

	const beginYear = begin_date?.slice(0, 4)
	const endYear = end_date?.slice(0, 4)

	if (type === 'group') {
		if (beginYear && endYear) {
			return `${beginYear} - ${endYear}`
		}
		if (beginYear) {
			return `Founded ${beginYear}`
		}
	} else if (type === 'person') {
		if (beginYear && endYear) {
			return `${beginYear} - ${endYear}`
		}
		if (beginYear) {
			return `Born ${beginYear}`
		}
	}

	return ''
}

function getArtistTypeLabel(type: string | null): string {
	switch (type) {
		case 'group':
			return 'Group'
		case 'person':
			return 'Artist'
		case 'orchestra':
			return 'Orchestra'
		case 'choir':
			return 'Choir'
		case 'character':
			return 'Character'
		default:
			return 'Artist'
	}
}

export function ArtistPage() {
	const navigate = useNavigate()
	const { artistId } = routeApi.useParams()
	const { token } = useAuth()
	const [artist, setArtist] = useState<ArtistResponse | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchArtist = useCallback(async () => {
		if (!token) return

		setIsLoading(true)
		setError(null)

		try {
			const response = await fetch(`${API_URL}/api/artists/${artistId}`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				if (response.status === 404) {
					setError('Artist not found')
				} else {
					setError('Failed to load artist')
				}
				return
			}

			const data = await response.json()
			setArtist(data)
		} catch (err) {
			console.error('Error fetching artist:', err)
			setError('Failed to load artist')
		} finally {
			setIsLoading(false)
		}
	}, [artistId, token])

	useEffect(() => {
		fetchArtist()
	}, [fetchArtist])

	const isGroup = artist?.type === 'group'
	const hasMembers =
		isGroup &&
		artist &&
		'members' in artist &&
		(artist.members.current.length > 0 ||
			artist.members.previous.length > 0)
	const hasGroups =
		!isGroup &&
		artist &&
		'groups' in artist &&
		(artist as PersonArtistResponse).groups.length > 0

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="border-b border-border">
				<div className="container mx-auto px-4 h-14 flex items-center gap-4">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate({ to: '/' })}
					>
						<ArrowLeft className="size-4" />
					</Button>
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
				</div>
			</header>

			{/* Main content */}
			<main className="container mx-auto px-4 py-8">
				{isLoading ? (
					<div className="max-w-md">
						{/* Skeleton loader */}
						<div className="flex items-center gap-4 mb-8">
							<div className="w-20 h-20 rounded-full bg-muted animate-pulse" />
							<div className="flex-1 space-y-2">
								<div className="h-6 bg-muted animate-pulse w-1/2" />
								<div className="h-4 bg-muted animate-pulse w-1/4" />
							</div>
						</div>
						<Card>
							<CardContent>
								<div className="space-y-3">
									{[...Array(3)].map((_, i) => (
										<div
											key={i}
											className="flex items-center gap-3 py-2"
										>
											<div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
											<div className="flex-1 space-y-1.5">
												<div className="h-4 bg-muted animate-pulse w-3/4" />
												<div className="h-3 bg-muted animate-pulse w-1/2" />
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				) : error ? (
					<div className="max-w-md">
						<div className="text-center py-12">
							<p className="text-muted-foreground">{error}</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={() => navigate({ to: '/' })}
							>
								Go back to dashboard
							</Button>
						</div>
					</div>
				) : artist ? (
					<div className="max-w-md">
						{/* Artist header */}
						<div className="flex items-center gap-4 mb-8">
							{artist.image_url ? (
								<img
									src={artist.image_url}
									alt={artist.name}
									className="w-20 h-20 rounded-full object-cover"
								/>
							) : (
								<div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
									{isGroup ? (
										<Users className="size-8 text-muted-foreground" />
									) : (
										<User className="size-8 text-muted-foreground" />
									)}
								</div>
							)}
							<div>
								<h1 className="text-2xl font-bold tracking-tight">
									{artist.name}
								</h1>
								<div className="flex items-center gap-2 mt-1">
									<span className="text-xs bg-muted px-2 py-0.5 rounded">
										{getArtistTypeLabel(artist.type)}
									</span>
									{formatArtistDates(
										artist.type,
										artist.begin_date,
										artist.end_date
									) && (
										<span className="text-xs text-muted-foreground flex items-center gap-1">
											<Calendar className="size-3" />
											{formatArtistDates(
												artist.type,
												artist.begin_date,
												artist.end_date
											)}
										</span>
									)}
								</div>
							</div>
						</div>

						{/* Members section (for groups) */}
						{isGroup && 'members' in artist && (
							<div className="space-y-4">
								{artist.members.current.length > 0 && (
									<Card>
										<CardContent>
											<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
												<Users className="size-4" />
												Current Members
											</h3>
											<div className="space-y-1">
												{artist.members.current.map(
													(member) => (
														<Link
															key={member.id}
															to="/artist/$artistId"
															params={{
																artistId:
																	member.id,
															}}
															className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
														>
															{member.image_url ? (
																<img
																	src={
																		member.image_url
																	}
																	alt={
																		member.name
																	}
																	className="w-10 h-10 rounded-full object-cover"
																/>
															) : (
																<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
																	<User className="size-4 text-muted-foreground" />
																</div>
															)}
															<div className="flex-1 min-w-0">
																<p className="text-sm font-medium truncate">
																	{
																		member.name
																	}
																</p>
																{formatMembershipDates(
																	member.begin_raw,
																	member.end_raw,
																	member.ended
																) && (
																	<p className="text-xs text-muted-foreground">
																		{formatMembershipDates(
																			member.begin_raw,
																			member.end_raw,
																			member.ended
																		)}
																	</p>
																)}
															</div>
														</Link>
													)
												)}
											</div>
										</CardContent>
									</Card>
								)}

								{artist.members.previous.length > 0 && (
									<Card>
										<CardContent>
											<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
												<Users className="size-4" />
												Previous Members
											</h3>
											<div className="space-y-1">
												{artist.members.previous.map(
													(member) => (
														<Link
															key={member.id}
															to="/artist/$artistId"
															params={{
																artistId:
																	member.id,
															}}
															className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
														>
															{member.image_url ? (
																<img
																	src={
																		member.image_url
																	}
																	alt={
																		member.name
																	}
																	className="w-10 h-10 rounded-full object-cover"
																/>
															) : (
																<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
																	<User className="size-4 text-muted-foreground" />
																</div>
															)}
															<div className="flex-1 min-w-0">
																<p className="text-sm font-medium truncate">
																	{
																		member.name
																	}
																</p>
																{formatMembershipDates(
																	member.begin_raw,
																	member.end_raw,
																	member.ended
																) && (
																	<p className="text-xs text-muted-foreground">
																		{formatMembershipDates(
																			member.begin_raw,
																			member.end_raw,
																			member.ended
																		)}
																	</p>
																)}
															</div>
														</Link>
													)
												)}
											</div>
										</CardContent>
									</Card>
								)}

								{!hasMembers && (
									<Card>
										<CardContent>
											<div className="flex items-center gap-3 text-muted-foreground py-4">
												<Users className="size-5" />
												<p className="text-sm">
													No member information
													available
												</p>
											</div>
										</CardContent>
									</Card>
								)}
							</div>
						)}

						{/* Groups section (for solo artists) */}
						{!isGroup && 'groups' in artist && hasGroups && (
							<Card>
								<CardContent>
									<h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-2">
										<Users className="size-4" />
										Member of
									</h3>
									<div className="space-y-1">
										{(
											artist as PersonArtistResponse
										).groups.map((group) => (
											<Link
												key={group.id}
												to="/artist/$artistId"
												params={{
													artistId: group.id,
												}}
												className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
											>
												{group.image_url ? (
													<img
														src={group.image_url}
														alt={group.name}
														className="w-10 h-10 rounded-full object-cover"
													/>
												) : (
													<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
														<Users className="size-4 text-muted-foreground" />
													</div>
												)}
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium truncate">
														{group.name}
													</p>
													{formatMembershipDates(
														group.begin_raw,
														group.end_raw,
														group.ended
													) && (
														<p className="text-xs text-muted-foreground">
															{formatMembershipDates(
																group.begin_raw,
																group.end_raw,
																group.ended
															)}
														</p>
													)}
												</div>
											</Link>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				) : null}
			</main>
		</div>
	)
}
