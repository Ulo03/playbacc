/**
 * Scrobble Service
 *
 * Handles the core scrobbling logic:
 * - Fetching listening history from Spotify
 * - Filtering plays by minimum duration threshold
 * - Resolving metadata via MusicBrainz
 * - Persisting tracks, artists, albums, and scrobbles to the database
 *
 * @module scrobbles
 */

import { db } from '../db'
import { eq, and } from 'drizzle-orm'
import {
	accounts,
	artists,
	albums,
	tracks,
	track_artists,
	track_albums,
	scrobbles,
	scrobble_state,
} from '@playbacc/types/db/schema'
import {
	getRecentlyPlayedTracks,
	getValidAccessToken,
	calculateExpiresAt,
	type SpotifyAccount,
	type RecentlyPlayedItem,
	type SpotifyTrack,
} from './spotify'
import { MusicBrainzCache } from './musicbrainz'
import { syncArtistRelationshipsByMbid } from './sync'
import type { MusicBrainzRecordingDetails } from '@playbacc/types/api/musicbrainz'

/**
 * Configuration for the scrobble service
 */
export const SCROBBLE_CONFIG = {
	/** Minimum play duration in seconds to count as a scrobble */
	minPlaySeconds: parseInt(process.env.SCROBBLE_MIN_PLAY_SECONDS || '30', 10),
	/** Minimum percentage of track duration to count as a scrobble (0-100) */
	minPlayPercent: parseInt(process.env.SCROBBLE_MIN_PLAY_PERCENT || '50', 10),
	/** Maximum items to fetch per Spotify API call */
	spotifyFetchLimit: 50,
}

/**
 * Checks if a play meets the scrobble threshold.
 * A play qualifies if it meets EITHER:
 * - The minimum play duration (e.g., 30 seconds), OR
 * - The minimum percentage of track duration (e.g., 50%)
 *
 * This matches Last.fm's scrobbling behavior where short tracks
 * can be scrobbled after playing a percentage of their duration.
 *
 * @param playedMs - How long the track was played (ms)
 * @param trackDurationMs - Total track duration (ms)
 * @returns True if the play meets the scrobble threshold
 */
export function meetsScrobbleThreshold(
	playedMs: number,
	trackDurationMs: number
): boolean {
	const minDurationMs = SCROBBLE_CONFIG.minPlaySeconds * 1000
	const minPercentMs =
		(trackDurationMs * SCROBBLE_CONFIG.minPlayPercent) / 100

	// Scrobble if either threshold is met
	return playedMs >= minDurationMs || playedMs >= minPercentMs
}

/**
 * Represents a processed play event from Spotify
 */
export interface ProcessedPlayEvent {
	/** Original Spotify play data */
	spotifyItem: RecentlyPlayedItem
	/** Parsed played_at timestamp */
	playedAt: Date
	/** Estimated duration the user actually played (ms) */
	estimatedDurationMs: number
	/** Whether this play meets the minimum duration threshold */
	meetsThreshold: boolean
}

/**
 * Represents resolved metadata for a track
 */
export interface ResolvedTrackMetadata {
	/** Track title (prefer MusicBrainz, fallback to Spotify) */
	title: string
	/** Track duration in ms */
	durationMs: number
	/** ISRC code if available */
	isrc: string | null
	/** MusicBrainz recording ID if resolved */
	mbid: string | null
	/** Whether the track is explicit */
	explicit: boolean
	/** Primary artist info */
	primaryArtist: {
		name: string
		mbid: string | null
	}
	/** All artist credits */
	artistCredits: Array<{
		name: string
		mbid: string | null
		isPrimary: boolean
		order: number
		joinPhrase: string
	}>
	/** Album info */
	album: {
		title: string
		mbid: string | null
		releaseDate: string | null
		imageUrl: string | null
	} | null
}

/**
 * Fetches all Spotify accounts eligible for scrobbling
 *
 * @returns Array of accounts with refresh tokens
 */
export async function getEligibleAccounts(): Promise<SpotifyAccount[]> {
	const result = await db.query.accounts.findMany({
		where: (accounts, { eq, isNotNull }) =>
			and(
				eq(accounts.provider, 'spotify'),
				isNotNull(accounts.refresh_token)
			),
	})

	return result as SpotifyAccount[]
}

/**
 * Gets the scrobble cursor state for a user
 *
 * @param userId - User ID
 * @returns Last played_at timestamp or null if never scrobbled
 */
export async function getScrobbleState(userId: string): Promise<Date | null> {
	const state = await db.query.scrobble_state.findFirst({
		where: (state, { eq, and }) =>
			and(eq(state.user_id, userId), eq(state.provider, 'spotify')),
	})

	return state?.last_played_at ?? null
}

/**
 * Updates the scrobble cursor state for a user
 *
 * @param userId - User ID
 * @param lastPlayedAt - New cursor position
 */
export async function updateScrobbleState(
	userId: string,
	lastPlayedAt: Date
): Promise<void> {
	await db
		.insert(scrobble_state)
		.values({
			user_id: userId,
			provider: 'spotify',
			last_played_at: lastPlayedAt,
			updated_at: new Date(),
		})
		.onConflictDoUpdate({
			target: [scrobble_state.user_id, scrobble_state.provider],
			set: {
				last_played_at: lastPlayedAt,
				updated_at: new Date(),
			},
		})
}

/**
 * Fetches new plays from Spotify since the last cursor position
 *
 * @param accessToken - Valid Spotify access token
 * @param afterTimestamp - Fetch plays after this timestamp (null for initial fetch)
 * @returns Array of recently played items, sorted ascending by played_at
 */
export async function fetchNewSpotifyPlays(
	accessToken: string,
	afterTimestamp: Date | null
): Promise<RecentlyPlayedItem[]> {
	const allItems: RecentlyPlayedItem[] = []

	// Convert timestamp to Spotify's expected format (Unix ms)
	const afterMs = afterTimestamp
		? afterTimestamp.getTime().toString()
		: undefined

	try {
		// Fetch first page
		const response = await getRecentlyPlayedTracks(accessToken, {
			limit: SCROBBLE_CONFIG.spotifyFetchLimit,
			after: afterMs,
		})

		allItems.push(...response.items)

		// Note: Spotify's recently-played endpoint doesn't support true pagination
		// for historical data. It only returns up to 50 most recent items.
		// We don't need to paginate further as each poll will catch new plays.
	} catch (error) {
		console.error('[Scrobble] Error fetching Spotify plays:', error)
		throw error
	}

	// Sort ascending by played_at (oldest first) for proper duration estimation
	allItems.sort(
		(a, b) =>
			new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
	)

	return allItems
}

/**
 * Processes raw Spotify play events into structured data with duration estimates.
 *
 * Duration estimation logic:
 * - If there's a subsequent play, duration = min(track_duration, time_until_next_play)
 * - If it's the last play, assume full track duration
 *
 * @param items - Raw Spotify play items (must be sorted ascending by played_at)
 * @returns Processed play events with duration estimates
 */
export function processPlayEvents(
	items: RecentlyPlayedItem[]
): ProcessedPlayEvent[] {
	return items.map((item, index) => {
		const playedAt = new Date(item.played_at)
		const trackDurationMs = item.track.duration_ms

		let estimatedDurationMs: number

		if (index < items.length - 1) {
			// There's a next play - estimate duration as time until next play
			const nextPlayedAt = new Date(items[index + 1].played_at)
			const timeBetweenPlays = nextPlayedAt.getTime() - playedAt.getTime()
			estimatedDurationMs = Math.min(trackDurationMs, timeBetweenPlays)
		} else {
			// Last play - assume full duration
			estimatedDurationMs = trackDurationMs
		}

		return {
			spotifyItem: item,
			playedAt,
			estimatedDurationMs,
			meetsThreshold: meetsScrobbleThreshold(
				estimatedDurationMs,
				trackDurationMs
			),
		}
	})
}

/**
 * Looks up an existing track in the database by ISRC.
 * Returns the track with its associated artists and albums if found.
 *
 * @param isrc - ISRC code to look up
 * @returns Track data with relations, or null if not found
 */
async function findExistingTrackByIsrc(isrc: string): Promise<{
	track: typeof tracks.$inferSelect
	trackArtists: Array<{
		artist: typeof artists.$inferSelect
		isPrimary: boolean
		order: number
		joinPhrase: string
	}>
	album: typeof albums.$inferSelect | null
} | null> {
	const track = await db.query.tracks.findFirst({
		where: (tracks, { eq }) => eq(tracks.isrc, isrc),
	})

	if (!track) {
		return null
	}

	// Get track artists
	const trackArtistLinks = await db.query.track_artists.findMany({
		where: (ta, { eq }) => eq(ta.track_id, track.id),
	})

	const trackArtists: Array<{
		artist: typeof artists.$inferSelect
		isPrimary: boolean
		order: number
		joinPhrase: string
	}> = []

	for (const link of trackArtistLinks) {
		const artist = await db.query.artists.findFirst({
			where: (artists, { eq }) => eq(artists.id, link.artist_id),
		})
		if (artist) {
			trackArtists.push({
				artist,
				isPrimary: link.is_primary,
				order: link.order,
				joinPhrase: link.join_phrase,
			})
		}
	}

	// Sort by order
	trackArtists.sort((a, b) => a.order - b.order)

	// Get first linked album (if any)
	const trackAlbumLink = await db.query.track_albums.findFirst({
		where: (ta, { eq }) => eq(ta.track_id, track.id),
	})

	let album: typeof albums.$inferSelect | null = null
	if (trackAlbumLink) {
		album =
			(await db.query.albums.findFirst({
				where: (albums, { eq }) =>
					eq(albums.id, trackAlbumLink.album_id),
			})) ?? null
	}

	return { track, trackArtists, album }
}

/**
 * Converts existing track data from DB to ResolvedTrackMetadata format.
 *
 * @param existing - Existing track data from database
 * @param spotifyItem - Original Spotify item (for album image fallback)
 * @returns ResolvedTrackMetadata
 */
function existingTrackToMetadata(
	existing: NonNullable<Awaited<ReturnType<typeof findExistingTrackByIsrc>>>,
	spotifyItem: RecentlyPlayedItem
): ResolvedTrackMetadata {
	const { track, trackArtists, album } = existing
	const spotifyAlbum = spotifyItem.track.album

	const artistCredits: ResolvedTrackMetadata['artistCredits'] =
		trackArtists.map((ta) => ({
			name: ta.artist.name,
			mbid: ta.artist.mbid,
			isPrimary: ta.isPrimary,
			order: ta.order,
			joinPhrase: ta.joinPhrase,
		}))

	// If no artists found in DB, use Spotify data
	if (artistCredits.length === 0) {
		spotifyItem.track.artists.forEach((artist, index) => {
			artistCredits.push({
				name: artist.name,
				mbid: null,
				isPrimary: index === 0,
				order: index,
				joinPhrase:
					index < spotifyItem.track.artists.length - 1 ? ', ' : '',
			})
		})
	}

	let albumInfo: ResolvedTrackMetadata['album'] = null
	if (album) {
		albumInfo = {
			title: album.title,
			mbid: album.mbid,
			releaseDate: album.release_date,
			imageUrl: album.image_url, // Already from MB/CAA, no Spotify fallback
		}
	} else if (spotifyAlbum) {
		// Use Spotify album data if not in DB, but no image (MB-only policy)
		albumInfo = {
			title: spotifyAlbum.name,
			mbid: null,
			releaseDate: spotifyAlbum.release_date ?? null,
			imageUrl: null, // No Spotify images
		}
	}

	return {
		title: track.title,
		durationMs: track.duration_ms ?? spotifyItem.track.duration_ms,
		isrc: track.isrc,
		mbid: track.mbid,
		explicit: track.explicit,
		primaryArtist: {
			name: artistCredits[0]?.name ?? 'Unknown Artist',
			mbid: artistCredits[0]?.mbid ?? null,
		},
		artistCredits,
		album: albumInfo,
	}
}

/**
 * Resolves track metadata, first checking the database, then MusicBrainz.
 * This optimization skips expensive MusicBrainz API calls for tracks
 * that have already been scrobbled.
 *
 * @param event - Processed play event
 * @param cache - MusicBrainz cache instance
 * @returns Resolved metadata (may contain null MBIDs if not found)
 */
export async function resolveTrackMetadata(
	event: ProcessedPlayEvent,
	cache: MusicBrainzCache
): Promise<ResolvedTrackMetadata> {
	const spotifyTrack = event.spotifyItem.track
	const spotifyAlbum = spotifyTrack.album
	const isrc = spotifyTrack.external_ids?.isrc ?? null
	const primaryArtistName = spotifyTrack.artists[0]?.name ?? 'Unknown Artist'

	// OPTIMIZATION: Check if track already exists in database by ISRC
	// This avoids MusicBrainz API calls for tracks we've already resolved
	if (isrc) {
		const existing = await findExistingTrackByIsrc(isrc)
		if (existing) {
			return existingTrackToMetadata(existing, event.spotifyItem)
		}
	}

	// Track not in DB, resolve via MusicBrainz
	let mbRecording: MusicBrainzRecordingDetails | null = null
	let recordingMbid: string | null = null

	// Try ISRC lookup first (most reliable)
	if (isrc) {
		recordingMbid = await cache.lookupByIsrc(isrc)
	}

	// Fallback to search if ISRC lookup failed
	if (!recordingMbid) {
		recordingMbid = await cache.searchRecordingCached(
			spotifyTrack.name,
			primaryArtistName,
			spotifyAlbum?.name
		)
	}

	// Get full recording details if we have an MBID
	if (recordingMbid) {
		mbRecording = await cache.getDetailsCached(recordingMbid)
	}

	// Build artist credits from MusicBrainz or Spotify data
	const artistCredits: ResolvedTrackMetadata['artistCredits'] = []

	if (mbRecording?.['artist-credit']) {
		mbRecording['artist-credit'].forEach((credit, index) => {
			artistCredits.push({
				name: credit.name ?? credit.artist.name ?? 'Unknown',
				mbid: credit.artist.id,
				isPrimary: index === 0,
				order: index,
				joinPhrase: credit.joinphrase ?? '',
			})
		})
	} else {
		// Fallback to Spotify artist data
		spotifyTrack.artists.forEach((artist, index) => {
			artistCredits.push({
				name: artist.name,
				mbid: null,
				isPrimary: index === 0,
				order: index,
				joinPhrase: index < spotifyTrack.artists.length - 1 ? ', ' : '',
			})
		})
	}

	// Build album info (using MusicBrainz/Cover Art Archive only, no Spotify images)
	let albumInfo: ResolvedTrackMetadata['album'] = null
	if (spotifyAlbum) {
		// Try to find album MBID from MusicBrainz recording releases
		let albumMbid: string | null = null
		let albumCoverUrl: string | null = null

		if (mbRecording?.releases && mbRecording.releases.length > 0) {
			// Prefer official album releases
			const officialRelease = mbRecording.releases.find(
				(r) => r.status === 'Official'
			)
			albumMbid = officialRelease?.id ?? mbRecording.releases[0].id

			// Fetch cover art from Cover Art Archive (MB-only, no Spotify)
			if (albumMbid) {
				albumCoverUrl = await cache.getReleaseCoverUrlCached(albumMbid)
			}
		}

		albumInfo = {
			title: spotifyAlbum.name,
			mbid: albumMbid,
			releaseDate: spotifyAlbum.release_date ?? null,
			imageUrl: albumCoverUrl,
		}
	}

	return {
		title: mbRecording?.title ?? spotifyTrack.name,
		durationMs: mbRecording?.length ?? spotifyTrack.duration_ms,
		isrc,
		mbid: recordingMbid,
		explicit: spotifyTrack.explicit,
		primaryArtist: {
			name: artistCredits[0]?.name ?? primaryArtistName,
			mbid: artistCredits[0]?.mbid ?? null,
		},
		artistCredits,
		album: albumInfo,
	}
}

/**
 * Input type for resolveTrackMetadataFromSpotify.
 * Matches the shape of SpotifyTrack but with only the fields we need.
 */
export interface SpotifyTrackInput {
	id: string
	name: string
	duration_ms: number
	explicit: boolean
	artists: Array<{ id?: string; name: string }>
	album: {
		id?: string
		name: string
		images?: Array<{ url: string }>
		release_date?: string
	}
	external_ids?: { isrc?: string }
}

/**
 * Resolves track metadata from a Spotify track object (e.g., from currently-playing).
 * Similar to resolveTrackMetadata but takes a SpotifyTrack directly instead of ProcessedPlayEvent.
 *
 * @param spotifyTrack - Spotify track data
 * @param cache - MusicBrainz cache instance
 * @returns Resolved metadata (may contain null MBIDs if not found)
 */
export async function resolveTrackMetadataFromSpotify(
	spotifyTrack: SpotifyTrackInput,
	cache: MusicBrainzCache
): Promise<ResolvedTrackMetadata> {
	const spotifyAlbum = spotifyTrack.album
	const isrc = spotifyTrack.external_ids?.isrc ?? null
	const primaryArtistName = spotifyTrack.artists[0]?.name ?? 'Unknown Artist'

	// OPTIMIZATION: Check if track already exists in database by ISRC
	if (isrc) {
		const existing = await findExistingTrackByIsrc(isrc)
		if (existing) {
			// Convert existing to metadata format
			// We need to create a minimal spotifyItem for the helper function
			const fakeItem: RecentlyPlayedItem = {
				track: {
					id: spotifyTrack.id,
					name: spotifyTrack.name,
					duration_ms: spotifyTrack.duration_ms,
					explicit: spotifyTrack.explicit,
					artists: spotifyTrack.artists.map((a) => ({
						id: (a as { id?: string }).id ?? '',
						name: a.name,
					})),
					album: {
						id: (spotifyAlbum as { id?: string }).id ?? '',
						name: spotifyAlbum.name,
						images: spotifyAlbum.images,
						release_date: spotifyAlbum.release_date,
						artists: [],
					},
					external_ids: spotifyTrack.external_ids,
				},
				played_at: new Date().toISOString(),
			}
			return existingTrackToMetadata(existing, fakeItem)
		}
	}

	// Track not in DB, resolve via MusicBrainz
	let mbRecording: MusicBrainzRecordingDetails | null = null
	let recordingMbid: string | null = null

	// Try ISRC lookup first (most reliable)
	if (isrc) {
		recordingMbid = await cache.lookupByIsrc(isrc)
	}

	// Fallback to search if ISRC lookup failed
	if (!recordingMbid) {
		recordingMbid = await cache.searchRecordingCached(
			spotifyTrack.name,
			primaryArtistName,
			spotifyAlbum?.name
		)
	}

	// Get full recording details if we have an MBID
	if (recordingMbid) {
		mbRecording = await cache.getDetailsCached(recordingMbid)
	}

	// Build artist credits from MusicBrainz or Spotify data
	const artistCredits: ResolvedTrackMetadata['artistCredits'] = []

	if (mbRecording?.['artist-credit']) {
		mbRecording['artist-credit'].forEach((credit, index) => {
			artistCredits.push({
				name: credit.name ?? credit.artist.name ?? 'Unknown',
				mbid: credit.artist.id,
				isPrimary: index === 0,
				order: index,
				joinPhrase: credit.joinphrase ?? '',
			})
		})
	} else {
		// Fallback to Spotify artist data
		spotifyTrack.artists.forEach((artist, index) => {
			artistCredits.push({
				name: artist.name,
				mbid: null,
				isPrimary: index === 0,
				order: index,
				joinPhrase: index < spotifyTrack.artists.length - 1 ? ', ' : '',
			})
		})
	}

	// Build album info (using MusicBrainz/Cover Art Archive only, no Spotify images)
	let albumInfo: ResolvedTrackMetadata['album'] = null
	if (spotifyAlbum) {
		// Try to find album MBID from MusicBrainz recording releases
		let albumMbid: string | null = null
		let albumCoverUrl: string | null = null

		if (mbRecording?.releases && mbRecording.releases.length > 0) {
			// Prefer official album releases
			const officialRelease = mbRecording.releases.find(
				(r) => r.status === 'Official'
			)
			albumMbid = officialRelease?.id ?? mbRecording.releases[0].id

			// Fetch cover art from Cover Art Archive (MB-only, no Spotify)
			if (albumMbid) {
				albumCoverUrl = await cache.getReleaseCoverUrlCached(albumMbid)
			}
		}

		albumInfo = {
			title: spotifyAlbum.name,
			mbid: albumMbid,
			releaseDate: spotifyAlbum.release_date ?? null,
			imageUrl: albumCoverUrl,
		}
	}

	return {
		title: mbRecording?.title ?? spotifyTrack.name,
		durationMs: mbRecording?.length ?? spotifyTrack.duration_ms,
		isrc,
		mbid: recordingMbid,
		explicit: spotifyTrack.explicit,
		primaryArtist: {
			name: artistCredits[0]?.name ?? primaryArtistName,
			mbid: artistCredits[0]?.mbid ?? null,
		},
		artistCredits,
		album: albumInfo,
	}
}

/**
 * Triggers auto-sync for an artist's MusicBrainz relationships.
 * Runs asynchronously (fire-and-forget) to not block the main flow.
 *
 * @param mbid - MusicBrainz artist ID
 */
function triggerAutoSync(mbid: string): void {
	// Fire-and-forget: don't await, just log errors
	syncArtistRelationshipsByMbid(mbid)
		.then((result) => {
			if (result.errors.length > 0) {
				console.warn(
					`[AutoSync] Completed with errors for ${mbid}:`,
					result.errors
				)
			} else {
				console.log(
					`[AutoSync] Synced ${mbid}: type=${result.artistType}, memberships=${result.membershipsInserted}/${result.membershipsProcessed}`
				)
			}
		})
		.catch((error) => {
			console.error(`[AutoSync] Failed for ${mbid}:`, error)
		})
}

/**
 * Upserts an artist into the database.
 * Triggers auto-sync of MusicBrainz relationships when:
 * - A new artist is created with an MBID
 * - An existing artist (by name) gets an MBID attached for the first time
 *
 * @param name - Artist name
 * @param mbid - MusicBrainz artist ID (optional)
 * @returns Artist database ID
 */
async function upsertArtist(
	name: string,
	mbid: string | null
): Promise<string> {
	// Try to find existing artist by MBID first
	if (mbid) {
		const existing = await db.query.artists.findFirst({
			where: (artists, { eq }) => eq(artists.mbid, mbid),
		})
		if (existing) {
			return existing.id
		}
	}

	// Try to find by name if no MBID match
	const existingByName = await db.query.artists.findFirst({
		where: (artists, { eq }) => eq(artists.name, name),
	})
	if (existingByName) {
		// Update with MBID if we now have one
		if (mbid && !existingByName.mbid) {
			await db
				.update(artists)
				.set({ mbid })
				.where(eq(artists.id, existingByName.id))

			// Trigger auto-sync for newly attached MBID
			triggerAutoSync(mbid)
		}
		return existingByName.id
	}

	// Create new artist
	const [newArtist] = await db
		.insert(artists)
		.values({ name, mbid })
		.returning()

	// Trigger auto-sync for new artist with MBID
	if (mbid) {
		triggerAutoSync(mbid)
	}

	return newArtist.id
}

/**
 * Upserts an album into the database
 *
 * @param title - Album title
 * @param artistId - Primary artist database ID
 * @param mbid - MusicBrainz release ID (optional)
 * @param releaseDate - Release date string (optional)
 * @param imageUrl - Album cover URL (optional)
 * @returns Album database ID
 */
async function upsertAlbum(
	title: string,
	artistId: string,
	mbid: string | null,
	releaseDate: string | null,
	imageUrl: string | null
): Promise<string> {
	// Try to find existing album by MBID
	if (mbid) {
		const existing = await db.query.albums.findFirst({
			where: (albums, { eq }) => eq(albums.mbid, mbid),
		})
		if (existing) {
			return existing.id
		}
	}

	// Try to find by title and artist
	const existingByTitle = await db.query.albums.findFirst({
		where: (albums, { eq, and }) =>
			and(eq(albums.title, title), eq(albums.artist_id, artistId)),
	})
	if (existingByTitle) {
		// Update with MBID if we now have one
		if (mbid && !existingByTitle.mbid) {
			await db
				.update(albums)
				.set({ mbid })
				.where(eq(albums.id, existingByTitle.id))
		}
		return existingByTitle.id
	}

	// Create new album
	const [newAlbum] = await db
		.insert(albums)
		.values({
			title,
			artist_id: artistId,
			mbid,
			release_date: releaseDate,
			image_url: imageUrl,
		})
		.returning()

	return newAlbum.id
}

/**
 * Upserts a track into the database
 *
 * @param metadata - Resolved track metadata
 * @returns Track database ID
 */
async function upsertTrack(metadata: ResolvedTrackMetadata): Promise<string> {
	// Try to find existing track by ISRC (most reliable identifier)
	if (metadata.isrc) {
		const existing = await db.query.tracks.findFirst({
			where: (tracks, { eq }) => eq(tracks.isrc, metadata.isrc!),
		})
		if (existing) {
			// Update with MBID if we now have one
			if (metadata.mbid && !existing.mbid) {
				await db
					.update(tracks)
					.set({ mbid: metadata.mbid })
					.where(eq(tracks.id, existing.id))
			}
			return existing.id
		}
	}

	// Try to find by MBID
	if (metadata.mbid) {
		const existing = await db.query.tracks.findFirst({
			where: (tracks, { eq }) => eq(tracks.mbid, metadata.mbid!),
		})
		if (existing) {
			return existing.id
		}
	}

	// Create new track
	const [newTrack] = await db
		.insert(tracks)
		.values({
			title: metadata.title,
			duration_ms: metadata.durationMs,
			mbid: metadata.mbid,
			isrc: metadata.isrc,
			explicit: metadata.explicit,
		})
		.returning()

	return newTrack.id
}

/**
 * Links track to artists via the track_artists join table
 *
 * @param trackId - Track database ID
 * @param artistCredits - Array of artist credit info
 */
async function linkTrackArtists(
	trackId: string,
	artistCredits: ResolvedTrackMetadata['artistCredits']
): Promise<void> {
	for (const credit of artistCredits) {
		const artistId = await upsertArtist(credit.name, credit.mbid)

		// Check if link already exists
		const existing = await db.query.track_artists.findFirst({
			where: (ta, { eq, and }) =>
				and(eq(ta.track_id, trackId), eq(ta.artist_id, artistId)),
		})

		if (!existing) {
			await db.insert(track_artists).values({
				track_id: trackId,
				artist_id: artistId,
				is_primary: credit.isPrimary,
				order: credit.order,
				join_phrase: credit.joinPhrase,
			})
		}
	}
}

/**
 * Links track to album via the track_albums join table
 *
 * @param trackId - Track database ID
 * @param albumId - Album database ID
 */
async function linkTrackAlbum(trackId: string, albumId: string): Promise<void> {
	// Check if link already exists
	const existing = await db.query.track_albums.findFirst({
		where: (ta, { eq, and }) =>
			and(eq(ta.track_id, trackId), eq(ta.album_id, albumId)),
	})

	if (!existing) {
		await db.insert(track_albums).values({
			track_id: trackId,
			album_id: albumId,
		})
	}
}

/**
 * Dedupe window configuration.
 *
 * Spotify's recently-played `played_at` is when the track **finished** playing,
 * while our currently-playing `started_at` is when we detected the track **starting**.
 * The window needs to account for:
 * - Track duration (up to ~10 minutes for most songs)
 * - Clock drift and API latency
 */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Checks if a similar scrobble already exists within the dedupe window.
 * This prevents duplicates when both currently-playing and recently-played
 * capture the same play event.
 *
 * @param userId - User database ID
 * @param trackId - Track database ID
 * @param playedAt - Timestamp to check around
 * @returns True if a similar scrobble exists
 */
async function hasExistingScrobbleInWindow(
	userId: string,
	trackId: string,
	playedAt: Date
): Promise<boolean> {
	const windowStart = new Date(playedAt.getTime() - DEDUPE_WINDOW_MS)
	const windowEnd = new Date(playedAt.getTime() + DEDUPE_WINDOW_MS)

	const existing = await db.query.scrobbles.findFirst({
		where: (s, { eq, and, between }) =>
			and(
				eq(s.user_id, userId),
				eq(s.track_id, trackId),
				between(s.played_at, windowStart, windowEnd)
			),
	})

	return existing !== undefined
}

/**
 * Persists a scrobble and all related entities to the database.
 *
 * @param userId - User database ID
 * @param event - Processed play event
 * @param metadata - Resolved track metadata
 * @returns True if scrobble was inserted, false if duplicate
 */
export async function persistScrobble(
	userId: string,
	event: ProcessedPlayEvent,
	metadata: ResolvedTrackMetadata
): Promise<boolean> {
	try {
		// Upsert track first so we have the trackId for dedupe check
		const trackId = await upsertTrack(metadata)

		// Check for existing scrobble in dedupe window
		// This prevents duplicates when currently-playing already scrobbled this track
		const isDuplicate = await hasExistingScrobbleInWindow(
			userId,
			trackId,
			event.playedAt
		)

		if (isDuplicate) {
			// Still link track to artists/albums even if scrobble is duplicate
			// (in case they weren't linked before)
			await linkTrackArtists(trackId, metadata.artistCredits)
			if (metadata.album) {
				const primaryArtistId = await upsertArtist(
					metadata.primaryArtist.name,
					metadata.primaryArtist.mbid
				)
				const albumId = await upsertAlbum(
					metadata.album.title,
					primaryArtistId,
					metadata.album.mbid,
					metadata.album.releaseDate,
					metadata.album.imageUrl
				)
				await linkTrackAlbum(trackId, albumId)
			}
			return false // Already scrobbled
		}

		// Link track to artists
		await linkTrackArtists(trackId, metadata.artistCredits)

		// Upsert and link album if present
		let albumId: string | null = null
		if (metadata.album) {
			const primaryArtistId = await upsertArtist(
				metadata.primaryArtist.name,
				metadata.primaryArtist.mbid
			)
			albumId = await upsertAlbum(
				metadata.album.title,
				primaryArtistId,
				metadata.album.mbid,
				metadata.album.releaseDate,
				metadata.album.imageUrl
			)
			await linkTrackAlbum(trackId, albumId)
		}

		// Insert scrobble (with conflict ignore for idempotency)
		const result = await db
			.insert(scrobbles)
			.values({
				user_id: userId,
				track_id: trackId,
				album_id: albumId,
				played_at: event.playedAt,
				played_duration_ms: event.estimatedDurationMs,
				skipped: false,
				provider: 'spotify',
			})
			.onConflictDoNothing({
				target: [
					scrobbles.user_id,
					scrobbles.track_id,
					scrobbles.played_at,
				],
			})
			.returning()

		return result.length > 0
	} catch (error) {
		console.error('[Scrobble] Error persisting scrobble:', error)
		return false
	}
}

/**
 * Persists a scrobble from already-resolved metadata.
 * Used by the currently-playing flow where we have metadata but not a ProcessedPlayEvent.
 *
 * @param userId - User database ID
 * @param playedAt - When the track started playing
 * @param durationMs - How long the track was played (accumulated)
 * @param metadata - Resolved track metadata
 * @param skipped - Whether the track was skipped (played enough to scrobble but not to completion)
 * @returns True if scrobble was inserted, false if duplicate
 */
export async function persistScrobbleFromMetadata(
	userId: string,
	playedAt: Date,
	durationMs: number,
	metadata: ResolvedTrackMetadata,
	skipped: boolean = false
): Promise<boolean> {
	try {
		// Upsert track
		const trackId = await upsertTrack(metadata)

		// Link track to artists
		await linkTrackArtists(trackId, metadata.artistCredits)

		// Upsert and link album if present
		let albumId: string | null = null
		if (metadata.album) {
			const primaryArtistId = await upsertArtist(
				metadata.primaryArtist.name,
				metadata.primaryArtist.mbid
			)
			albumId = await upsertAlbum(
				metadata.album.title,
				primaryArtistId,
				metadata.album.mbid,
				metadata.album.releaseDate,
				metadata.album.imageUrl
			)
			await linkTrackAlbum(trackId, albumId)
		}

		// Insert scrobble (with conflict ignore for idempotency)
		const result = await db
			.insert(scrobbles)
			.values({
				user_id: userId,
				track_id: trackId,
				album_id: albumId,
				played_at: playedAt, // Pass Date object - Drizzle handles conversion
				played_duration_ms: durationMs,
				skipped,
				provider: 'spotify',
			})
			.onConflictDoNothing({
				target: [
					scrobbles.user_id,
					scrobbles.track_id,
					scrobbles.played_at,
				],
			})
			.returning()

		return result.length > 0
	} catch (error) {
		console.error(
			'[Scrobble] Error persisting scrobble from metadata:',
			error
		)
		return false
	}
}

/**
 * Main scrobble processing function for a single account.
 * Fetches new plays, filters, resolves, and persists.
 *
 * @param account - Spotify account to process
 * @param mbCache - Shared MusicBrainz cache
 * @returns Statistics about the processing run
 */
export async function processAccountScrobbles(
	account: SpotifyAccount,
	mbCache: MusicBrainzCache
): Promise<{
	fetched: number
	processed: number
	scrobbled: number
	skipped: number
	errors: number
}> {
	const stats = {
		fetched: 0,
		processed: 0,
		scrobbled: 0,
		skipped: 0,
		errors: 0,
	}

	try {
		// Get valid access token (refresh if needed)
		const accessToken = await getValidAccessToken(account, async (data) => {
			await db
				.update(accounts)
				.set({
					access_token: data.access_token,
					refresh_token: data.refresh_token,
					expires_in: data.expires_in,
				})
				.where(eq(accounts.id, account.id))
		})

		if (!accessToken) {
			console.warn(
				`[Scrobble] Could not obtain access token for account ${account.id}`
			)
			return stats
		}

		// Get cursor state
		const lastPlayedAt = await getScrobbleState(account.user_id)

		// Fetch new plays from Spotify
		const plays = await fetchNewSpotifyPlays(accessToken, lastPlayedAt)
		stats.fetched = plays.length

		if (plays.length === 0) {
			console.log(`[Scrobble] No new plays for user ${account.user_id}`)
			return stats
		}

		// Process play events (estimate durations)
		const processedEvents = processPlayEvents(plays)

		// Track the latest played_at for cursor update
		let latestPlayedAt: Date | null = null

		// Process each play event
		for (const event of processedEvents) {
			stats.processed++

			// Update latest timestamp regardless of threshold
			// (we want to advance the cursor past all plays we've seen)
			if (!latestPlayedAt || event.playedAt > latestPlayedAt) {
				latestPlayedAt = event.playedAt
			}

			// Skip plays that don't meet the minimum duration threshold
			if (!event.meetsThreshold) {
				stats.skipped++
				continue
			}

			try {
				// Resolve metadata
				const metadata = await resolveTrackMetadata(event, mbCache)

				// Persist the scrobble
				const inserted = await persistScrobble(
					account.user_id,
					event,
					metadata
				)

				if (inserted) {
					stats.scrobbled++
				}
			} catch (error) {
				stats.errors++
				console.error(
					`[Scrobble] Error processing play at ${event.playedAt}:`,
					error
				)
			}
		}

		// Update cursor state
		if (latestPlayedAt) {
			await updateScrobbleState(account.user_id, latestPlayedAt)
		}

		console.log(
			`[Scrobble] User ${account.user_id}: fetched=${stats.fetched}, scrobbled=${stats.scrobbled}, skipped=${stats.skipped}, errors=${stats.errors}`
		)
	} catch (error) {
		console.error(
			`[Scrobble] Error processing account ${account.id}:`,
			error
		)
		stats.errors++
	}

	return stats
}
