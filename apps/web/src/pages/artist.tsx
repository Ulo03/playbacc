import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link, getRouteApi } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Users, User, Calendar, ChevronDown, RefreshCw, Check, AlertCircle } from 'lucide-react'

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
	const [currentMembersExpanded, setCurrentMembersExpanded] = useState(false)
	const [previousMembersExpanded, setPreviousMembersExpanded] = useState(false)
	const [groupsExpanded, setGroupsExpanded] = useState(false)
	const [isSyncing, setIsSyncing] = useState(false)
	const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle')
	const [memberSyncStates, setMemberSyncStates] = useState<Record<string, 'idle' | 'syncing' | 'success' | 'error'>>({})

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

	const pollJobStatus = useCallback(async (jobId: string): Promise<boolean> => {
		if (!token) return false
		
		const maxAttempts = 30 // 30 * 2s = 60s max wait
		const pollInterval = 2000 // 2 seconds
		
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				const response = await fetch(`${API_URL}/api/sync/jobs/${jobId}`, {
					headers: { Authorization: `Bearer ${token}` },
				})
				
				if (!response.ok) return false
				
				const job = await response.json()
				
				if (job.status === 'succeeded') {
					return true
				} else if (job.status === 'failed') {
					return false
				}
				// Still pending or running, wait and try again
				await new Promise(resolve => setTimeout(resolve, pollInterval))
			} catch {
				return false
			}
		}
		return false // Timeout
	}, [token])

	const syncWithMusicBrainz = useCallback(async () => {
		if (!token || isSyncing) return

		setIsSyncing(true)
		setSyncStatus('idle')

		try {
			const response = await fetch(`${API_URL}/api/sync/artists/${artistId}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				throw new Error('Sync request failed')
			}

			const data = await response.json()

			// Poll job status if we got a job ID - keep syncing state until done
			if (data.jobId) {
				const succeeded = await pollJobStatus(data.jobId)
				setIsSyncing(false)
				if (succeeded) {
					setSyncStatus('success')
					fetchArtist()
				} else {
					setSyncStatus('error')
				}
			} else {
				// No job ID means sync was immediate or skipped
				setIsSyncing(false)
				setSyncStatus('success')
			}

			// Reset status after 3 seconds
			setTimeout(() => {
				setSyncStatus('idle')
			}, 3000)
		} catch (err) {
			console.error('Error syncing artist:', err)
			setSyncStatus('error')
			setIsSyncing(false)
			// Reset status after 3 seconds
			setTimeout(() => {
				setSyncStatus('idle')
			}, 3000)
		}
	}, [artistId, token, isSyncing, fetchArtist, pollJobStatus])

	const syncMember = useCallback(async (memberId: string, e: React.MouseEvent) => {
		e.preventDefault() // Prevent navigation when clicking sync button
		e.stopPropagation()
		
		if (!token || memberSyncStates[memberId] === 'syncing') return

		setMemberSyncStates(prev => ({ ...prev, [memberId]: 'syncing' }))

		try {
			const response = await fetch(`${API_URL}/api/sync/artists/${memberId}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				throw new Error('Sync request failed')
			}

			const data = await response.json()

			// Poll job status if we got a job ID - keep syncing state until done
			if (data.jobId) {
				const succeeded = await pollJobStatus(data.jobId)
				if (succeeded) {
					setMemberSyncStates(prev => ({ ...prev, [memberId]: 'success' }))
					fetchArtist() // Refresh to show updated member data
				} else {
					setMemberSyncStates(prev => ({ ...prev, [memberId]: 'error' }))
				}
			} else {
				// No job ID means sync was immediate or skipped
				setMemberSyncStates(prev => ({ ...prev, [memberId]: 'success' }))
			}

			// Reset status after 3 seconds
			setTimeout(() => {
				setMemberSyncStates(prev => ({ ...prev, [memberId]: 'idle' }))
			}, 3000)
		} catch (err) {
			console.error('Error syncing member:', err)
			setMemberSyncStates(prev => ({ ...prev, [memberId]: 'error' }))
			// Reset status after 3 seconds
			setTimeout(() => {
				setMemberSyncStates(prev => ({ ...prev, [memberId]: 'idle' }))
			}, 3000)
		}
	}, [token, memberSyncStates, pollJobStatus, fetchArtist])

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
							<div className="flex-1">
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
							<Button
								variant="outline"
								size="sm"
								onClick={syncWithMusicBrainz}
								disabled={isSyncing}
								className="shrink-0"
								title="Sync metadata from MusicBrainz"
							>
								{isSyncing ? (
									<RefreshCw className="size-4 animate-spin" />
								) : syncStatus === 'success' ? (
									<Check className="size-4 text-green-500" />
								) : syncStatus === 'error' ? (
									<AlertCircle className="size-4 text-red-500" />
								) : (
									<RefreshCw className="size-4" />
								)}
								<span className="ml-2 hidden sm:inline">
									{isSyncing ? 'Syncing...' : syncStatus === 'success' ? 'Synced!' : syncStatus === 'error' ? 'Failed' : 'Sync'}
								</span>
							</Button>
						</div>

						{/* Members section (for groups) */}
						{isGroup && 'members' in artist && (
							<div className="space-y-4">
								{artist.members.current.length > 0 && (
									<Card>
										<CardContent className="p-0">
											<button
												onClick={() => setCurrentMembersExpanded(!currentMembersExpanded)}
												className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-lg"
											>
												<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Users className="size-4" />
													Current Members
													<span className="text-xs bg-muted px-1.5 py-0.5 rounded">
														{artist.members.current.length}
													</span>
												</h3>
												<ChevronDown 
													className={`size-4 text-muted-foreground transition-transform duration-200 ${
														currentMembersExpanded ? 'rotate-180' : ''
													}`} 
												/>
											</button>
											{currentMembersExpanded && (
												<div className="space-y-1 px-4 pb-4">
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
																<button
																	onClick={(e) => syncMember(member.id, e)}
																	disabled={memberSyncStates[member.id] === 'syncing'}
																	className="p-1.5 rounded-md hover:bg-muted transition-colors"
																	title="Sync member metadata"
																>
																	{memberSyncStates[member.id] === 'syncing' ? (
																		<RefreshCw className="size-4 animate-spin text-muted-foreground" />
																	) : memberSyncStates[member.id] === 'success' ? (
																		<Check className="size-4 text-green-500" />
																	) : memberSyncStates[member.id] === 'error' ? (
																		<AlertCircle className="size-4 text-red-500" />
																	) : (
																		<RefreshCw className="size-4 text-muted-foreground" />
																	)}
																</button>
															</Link>
														)
													)}
												</div>
											)}
										</CardContent>
									</Card>
								)}

								{artist.members.previous.length > 0 && (
									<Card>
										<CardContent className="p-0">
											<button
												onClick={() => setPreviousMembersExpanded(!previousMembersExpanded)}
												className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-lg"
											>
												<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Users className="size-4" />
													Previous Members
													<span className="text-xs bg-muted px-1.5 py-0.5 rounded">
														{artist.members.previous.length}
													</span>
												</h3>
												<ChevronDown 
													className={`size-4 text-muted-foreground transition-transform duration-200 ${
														previousMembersExpanded ? 'rotate-180' : ''
													}`} 
												/>
											</button>
											{previousMembersExpanded && (
												<div className="space-y-1 px-4 pb-4">
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
																<button
																	onClick={(e) => syncMember(member.id, e)}
																	disabled={memberSyncStates[member.id] === 'syncing'}
																	className="p-1.5 rounded-md hover:bg-muted transition-colors"
																	title="Sync member metadata"
																>
																	{memberSyncStates[member.id] === 'syncing' ? (
																		<RefreshCw className="size-4 animate-spin text-muted-foreground" />
																	) : memberSyncStates[member.id] === 'success' ? (
																		<Check className="size-4 text-green-500" />
																	) : memberSyncStates[member.id] === 'error' ? (
																		<AlertCircle className="size-4 text-red-500" />
																	) : (
																		<RefreshCw className="size-4 text-muted-foreground" />
																	)}
																</button>
															</Link>
														)
													)}
												</div>
											)}
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
								<CardContent className="p-0">
									<button
										onClick={() => setGroupsExpanded(!groupsExpanded)}
										className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-lg"
									>
										<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
											<Users className="size-4" />
											Member of
											<span className="text-xs bg-muted px-1.5 py-0.5 rounded">
												{(artist as PersonArtistResponse).groups.length}
											</span>
										</h3>
										<ChevronDown 
											className={`size-4 text-muted-foreground transition-transform duration-200 ${
												groupsExpanded ? 'rotate-180' : ''
											}`} 
										/>
									</button>
									{groupsExpanded && (
										<div className="space-y-1 px-4 pb-4">
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
													<button
														onClick={(e) => syncMember(group.id, e)}
														disabled={memberSyncStates[group.id] === 'syncing'}
														className="p-1.5 rounded-md hover:bg-muted transition-colors"
														title="Sync group metadata"
													>
														{memberSyncStates[group.id] === 'syncing' ? (
															<RefreshCw className="size-4 animate-spin text-muted-foreground" />
														) : memberSyncStates[group.id] === 'success' ? (
															<Check className="size-4 text-green-500" />
														) : memberSyncStates[group.id] === 'error' ? (
															<AlertCircle className="size-4 text-red-500" />
														) : (
															<RefreshCw className="size-4 text-muted-foreground" />
														)}
													</button>
												</Link>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						)}
					</div>
				) : null}
			</main>
		</div>
	)
}
