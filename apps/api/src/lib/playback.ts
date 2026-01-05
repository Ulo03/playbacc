/**
 * Playback Session Engine
 *
 * Manages real-time playback tracking via Spotify's "currently playing" endpoint.
 * Enables accurate scrobbling including:
 * - Skipped tracks (that meet minimum duration)
 * - Looped/repeated tracks (detected via progress wrap)
 * - Pause-aware duration tracking
 *
 * @module playback
 */

import { db } from '../db'
import { eq, and } from 'drizzle-orm'
import {
	playback_sessions,
	accounts,
	scrobbles,
	tracks,
} from '@playbacc/types/db/schema'
import {
	getCurrentlyPlaying,
	getValidAccessToken,
	type SpotifyAccount,
} from './spotify'
import { MusicBrainzCache } from './musicbrainz'
import {
	SCROBBLE_CONFIG,
	resolveTrackMetadataFromSpotify,
	persistScrobbleFromMetadata,
	meetsScrobbleThreshold,
	type SpotifyTrackInput,
} from './scrobbles'

/**
 * Playback session configuration
 */
export const PLAYBACK_CONFIG = {
	/** Polling interval for currently-playing endpoint (ms) */
	pollIntervalMs: parseInt(
		process.env.SCROBBLE_CURRENTLY_PLAYING_POLL_INTERVAL_MS || '8000',
		10
	),
	/** Jitter factor (±10% of poll interval) */
	jitterFactor: 0.1,
	/**
	 * Minimum tolerance for detecting progress wrap (loop/repeat) in milliseconds.
	 * Even with percentage-based detection, we need a minimum to avoid false positives
	 * from small timing variations. Set slightly higher than poll interval.
	 */
	wrapMinToleranceMs: 15000,
	/**
	 * Percentage of track duration that progress must drop by to count as a wrap.
	 * If current progress is earlier than (last_progress - track_duration * threshold),
	 * we consider it a new play (loop/repeat).
	 * Default: 35% - so if you're at 80% and suddenly at 40%, that's only a 40% drop,
	 * not enough. But if you're at 80% and suddenly at 10%, that's a 70% drop = wrap.
	 */
	wrapThresholdPercent: parseInt(
		process.env.SCROBBLE_WRAP_THRESHOLD_PERCENT || '35',
		10
	),
	/**
	 * Maximum delta to accumulate in a single poll.
	 * Prevents huge jumps from glitches or seeks.
	 */
	maxDeltaMs: 30000,
	/**
	 * How long a session can be idle (paused/nothing playing) before being finalized.
	 * This allows pause/resume without losing progress, but eventually cleans up
	 * abandoned sessions. Default: 30 minutes.
	 */
	staleSessionMs: parseInt(
		process.env.SCROBBLE_STALE_SESSION_MS || '1800000',
		10
	),
	/**
	 * Percentage of track duration that must be played for a track to NOT be considered skipped.
	 * If a track meets the scrobble threshold but was finalized before reaching this percentage,
	 * it's marked as skipped. Default: 90% - completing less than 90% of a track = skip.
	 */
	skipThresholdPercent: parseInt(
		process.env.SCROBBLE_SKIP_THRESHOLD_PERCENT || '90',
		10
	),
	/**
	 * End-of-track margin in milliseconds.
	 * When a track's accumulated play time is within this margin of the track duration,
	 * it's treated as fully played. This compensates for polling intervals that may
	 * miss the final few seconds of playback.
	 * Default: 15000ms (15s) - should be higher than the polling interval (8s).
	 */
	endMarginMs: parseInt(process.env.SCROBBLE_END_MARGIN_MS || '15000', 10),
}

/**
 * Represents a playback session row from the database
 */
export interface PlaybackSession {
	user_id: string
	provider: 'spotify'
	track_uri: string
	started_at: Date
	last_seen_at: Date
	last_progress_ms: number
	accumulated_ms: number
	is_playing: boolean
	track_duration_ms: number | null
	track_metadata: SpotifyTrackInput | null
	scrobbled: boolean
	updated_at: Date
}

/**
 * Extracts the track ID from a Spotify URI.
 * @example extractTrackIdFromUri('spotify:track:4iV5W9uYEdYUVa79Axb7Rh') => '4iV5W9uYEdYUVa79Axb7Rh'
 */
export function extractTrackIdFromUri(uri: string): string | null {
	const match = uri.match(/^spotify:track:([a-zA-Z0-9]+)$/)
	return match ? match[1] : null
}

/**
 * Gets the current playback session for a user
 */
export async function getPlaybackSession(
	userId: string
): Promise<PlaybackSession | null> {
	const session = await db.query.playback_sessions.findFirst({
		where: (ps, { eq, and }) =>
			and(eq(ps.user_id, userId), eq(ps.provider, 'spotify')),
	})

	return session as PlaybackSession | null
}

/**
 * Creates or updates a playback session.
 * All timestamps are explicitly converted to ensure UTC storage.
 */
export async function upsertPlaybackSession(
	userId: string,
	data: Omit<PlaybackSession, 'updated_at'>
): Promise<void> {
	const now = new Date()

	await db
		.insert(playback_sessions)
		.values({
			...data,
			updated_at: now,
		})
		.onConflictDoUpdate({
			target: [playback_sessions.user_id, playback_sessions.provider],
			set: {
				track_uri: data.track_uri,
				started_at: data.started_at,
				last_seen_at: data.last_seen_at,
				last_progress_ms: data.last_progress_ms,
				accumulated_ms: data.accumulated_ms,
				is_playing: data.is_playing,
				track_duration_ms: data.track_duration_ms,
				track_metadata: data.track_metadata,
				scrobbled: data.scrobbled,
				updated_at: now,
			},
		})
}

/**
 * Deletes the playback session for a user
 */
export async function clearPlaybackSession(userId: string): Promise<void> {
	await db
		.delete(playback_sessions)
		.where(
			and(
				eq(playback_sessions.user_id, userId),
				eq(playback_sessions.provider, 'spotify')
			)
		)
}

/**
 * Calculates the effective accumulated play time, applying the end-of-track margin.
 * If the actual accumulated time is within `endMarginMs` of the track duration,
 * we treat it as fully played. This compensates for polling intervals that may
 * miss the final few seconds of playback.
 *
 * @param accumulatedMs - How long the track was actually played
 * @param trackDurationMs - Total track duration
 * @returns Effective accumulated time (clamped to track duration)
 */
function getEffectiveAccumulatedMs(
	accumulatedMs: number,
	trackDurationMs: number
): number {
	// If within margin of end, treat as fully played
	if (accumulatedMs + PLAYBACK_CONFIG.endMarginMs >= trackDurationMs) {
		return trackDurationMs
	}
	return accumulatedMs
}

/**
 * Determines if a session represents a skipped track.
 * A track is considered skipped if it:
 * 1. Meets the scrobble threshold (played enough to count)
 * 2. But was finalized before reaching the skip threshold percentage of the track
 *
 * Uses effective accumulated time (with end margin applied) to avoid marking
 * nearly-completed tracks as skipped due to polling timing.
 *
 * @param accumulatedMs - How long the track was actually played
 * @param trackDurationMs - Total track duration
 * @returns True if the track should be marked as skipped
 */
function isSkipped(accumulatedMs: number, trackDurationMs: number): boolean {
	const effectiveMs = getEffectiveAccumulatedMs(
		accumulatedMs,
		trackDurationMs
	)
	const skipThresholdMs =
		(trackDurationMs * PLAYBACK_CONFIG.skipThresholdPercent) / 100
	return effectiveMs < skipThresholdMs
}

/**
 * Finalizes a playback session into a scrobble if it meets the threshold.
 * Uses stored track_metadata from the session for reliable finalization
 * even when the currently playing track has changed.
 *
 * Note: This does NOT clear or modify the session. The caller is responsible
 * for updating the session's `scrobbled` flag or clearing it as needed.
 *
 * @param userId - User database ID
 * @param session - The session to finalize (must have track_metadata)
 * @param mbCache - MusicBrainz cache for metadata resolution
 * @returns True if a scrobble was created
 */
export async function finalizeSession(
	userId: string,
	session: PlaybackSession,
	mbCache: MusicBrainzCache
): Promise<boolean> {
	// Check if already scrobbled (prevents double-scrobble on pause/resume)
	if (session.scrobbled) {
		return false
	}

	// Check if we have the required track metadata
	if (!session.track_metadata) {
		console.warn(
			`[Playback] Cannot finalize session without track metadata`
		)
		return false
	}

	const trackDurationMs =
		session.track_duration_ms ?? session.track_metadata.duration_ms

	// Check if accumulated time meets threshold (either min duration OR min percent)
	if (!meetsScrobbleThreshold(session.accumulated_ms, trackDurationMs)) {
		const minDurationMs = SCROBBLE_CONFIG.minPlaySeconds * 1000
		const minPercentMs =
			(trackDurationMs * SCROBBLE_CONFIG.minPlayPercent) / 100
		console.log(
			`[Playback] Session for ${session.track_uri} did not meet threshold: ` +
				`${session.accumulated_ms}ms played (need ${minDurationMs}ms OR ${Math.round(minPercentMs)}ms which is ${SCROBBLE_CONFIG.minPlayPercent}% of ${trackDurationMs}ms)`
		)
		return false
	}

	try {
		// Check if we already have this scrobble in DB (dedupe by user_id, track, started_at)
		// We use started_at as played_at for stable identity
		const existingScrobble = await db.query.scrobbles.findFirst({
			where: (s, { eq, and, between }) =>
				and(
					eq(s.user_id, userId),
					eq(s.provider, 'spotify'),
					// Check within a small window around started_at
					between(
						s.played_at,
						new Date(session.started_at.getTime() - 5000),
						new Date(session.started_at.getTime() + 5000)
					)
				),
		})

		if (existingScrobble) {
			console.log(
				`[Playback] Scrobble already exists for session started at ${session.started_at.toISOString()}`
			)
			return false
		}

		// Resolve track metadata from stored Spotify data
		const metadata = await resolveTrackMetadataFromSpotify(
			session.track_metadata,
			mbCache
		)

		// Calculate effective accumulated time (with end margin applied)
		const effectiveAccumulatedMs = getEffectiveAccumulatedMs(
			session.accumulated_ms,
			trackDurationMs
		)

		// Determine if this was a skip (met threshold but didn't complete the track)
		const skipped = isSkipped(session.accumulated_ms, trackDurationMs)

		const inserted = await persistScrobbleFromMetadata(
			userId,
			session.started_at,
			effectiveAccumulatedMs,
			metadata,
			skipped
		)

		if (inserted) {
			const skipLabel = skipped ? ' [SKIPPED]' : ''
			// Log shows actual accumulated time for debugging, but persisted value uses effective time
			const marginApplied =
				effectiveAccumulatedMs !== session.accumulated_ms
					? ` (adjusted from ${Math.round(session.accumulated_ms / 1000)}s)`
					: ''
			console.log(
				`[Playback] Scrobbled: "${metadata.title}" (${Math.round(effectiveAccumulatedMs / 1000)}s / ${Math.round(trackDurationMs / 1000)}s${marginApplied})${skipLabel}`
			)
		}

		return inserted
	} catch (error) {
		console.error(`[Playback] Error finalizing session:`, error)
		return false
	}
}

/**
 * Checks if a session is stale (idle for too long).
 * A stale session should be finalized and cleared.
 */
function isSessionStale(session: PlaybackSession, now: Date): boolean {
	const idleMs = now.getTime() - session.last_seen_at.getTime()
	return idleMs > PLAYBACK_CONFIG.staleSessionMs
}

/**
 * Processes a single poll of the currently-playing endpoint for an account.
 * Handles session creation, updates, wrap detection, and finalization.
 *
 * Pause handling:
 * - When paused, session is kept alive (not finalized immediately)
 * - Progress accumulation only happens while is_playing=true
 * - Session is only finalized when track changes or session becomes stale
 * - `scrobbled` flag prevents double-scrobbling on pause/resume
 *
 * @param account - Spotify account to process
 * @param mbCache - MusicBrainz cache for metadata resolution
 * @returns Statistics about what happened
 */
export async function processCurrentlyPlaying(
	account: SpotifyAccount,
	mbCache: MusicBrainzCache
): Promise<{
	scrobbled: boolean
	sessionUpdated: boolean
	error: boolean
}> {
	const result = { scrobbled: false, sessionUpdated: false, error: false }

	try {
		// Get valid access token
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
				`[Playback] Could not obtain access token for account ${account.id}`
			)
			result.error = true
			return result
		}

		// Fetch currently playing
		const currentlyPlaying = await getCurrentlyPlaying(accessToken)
		const now = new Date()

		// Load existing session
		const session = await getPlaybackSession(account.user_id)

		// Case A: Nothing is playing (or paused with no track info)
		if (!currentlyPlaying || !currentlyPlaying.item) {
			if (session) {
				// Check if session is stale - if so, finalize and clear
				if (isSessionStale(session, now)) {
					result.scrobbled = await finalizeSession(
						account.user_id,
						session,
						mbCache
					)
					await clearPlaybackSession(account.user_id)
				}
				// Otherwise, keep the session alive (user might resume)
				// Don't update last_seen_at so staleness check works
			}
			return result
		}

		const track = currentlyPlaying.item
		const trackUri = track.uri
		const progressMs = currentlyPlaying.progress_ms ?? 0
		const isPlaying = currentlyPlaying.is_playing

		// Extract track metadata for storage
		const trackMetadata: SpotifyTrackInput = {
			id: track.id,
			name: track.name,
			duration_ms: track.duration_ms,
			explicit: track.explicit,
			artists: track.artists,
			album: track.album,
			external_ids: track.external_ids,
		}

		// Case B: No existing session - create one
		if (!session) {
			await upsertPlaybackSession(account.user_id, {
				user_id: account.user_id,
				provider: 'spotify',
				track_uri: trackUri,
				started_at: now,
				last_seen_at: now,
				last_progress_ms: progressMs,
				accumulated_ms: 0,
				is_playing: isPlaying,
				track_duration_ms: track.duration_ms,
				track_metadata: trackMetadata,
				scrobbled: false,
			})
			result.sessionUpdated = true
			return result
		}

		// Case C: Same track - continue session
		if (session.track_uri === trackUri) {
			let newAccumulated = session.accumulated_ms
			const delta = progressMs - session.last_progress_ms

			// Only accumulate time if was playing in previous poll
			if (session.is_playing) {
				// Check for wrap (loop/repeat detection)
				// Progress dropped significantly = track restarted
				// Use percentage of track duration with a minimum tolerance
				const wrapThresholdMs = Math.max(
					PLAYBACK_CONFIG.wrapMinToleranceMs,
					(track.duration_ms * PLAYBACK_CONFIG.wrapThresholdPercent) /
						100
				)
				if (delta < -wrapThresholdMs) {
					// Wrap detected! Finalize current play, start new session
					console.log(
						`[Playback] Wrap detected for ${track.name}: progress ${session.last_progress_ms}ms -> ${progressMs}ms (threshold: ${wrapThresholdMs}ms)`
					)

					// Finalize the completed play
					result.scrobbled = await finalizeSession(
						account.user_id,
						session,
						mbCache
					)

					// Start fresh session for the new loop
					await upsertPlaybackSession(account.user_id, {
						user_id: account.user_id,
						provider: 'spotify',
						track_uri: trackUri,
						started_at: now,
						last_seen_at: now,
						last_progress_ms: progressMs,
						accumulated_ms: 0,
						is_playing: isPlaying,
						track_duration_ms: track.duration_ms,
						track_metadata: trackMetadata,
						scrobbled: false,
					})
					result.sessionUpdated = true
					return result
				}

				// Normal progress - accumulate time
				if (delta > 0 && delta <= PLAYBACK_CONFIG.maxDeltaMs) {
					newAccumulated += delta
				} else if (delta > PLAYBACK_CONFIG.maxDeltaMs) {
					// Large forward seek - add clamped amount
					newAccumulated += PLAYBACK_CONFIG.maxDeltaMs
				}
				// Negative delta (small backward seek) - don't add, just update position
			}

			// Update session
			await upsertPlaybackSession(account.user_id, {
				user_id: account.user_id,
				provider: 'spotify',
				track_uri: trackUri,
				started_at: session.started_at,
				last_seen_at: now,
				last_progress_ms: progressMs,
				accumulated_ms: newAccumulated,
				is_playing: isPlaying,
				track_duration_ms: track.duration_ms,
				track_metadata: session.track_metadata, // Preserve original metadata
				scrobbled: session.scrobbled,
			})
			result.sessionUpdated = true
			return result
		}

		// Case D: Track changed - finalize old, start new
		// Try to scrobble the old session if not already scrobbled
		if (!session.scrobbled) {
			result.scrobbled = await finalizeSession(
				account.user_id,
				session,
				mbCache
			)
		}

		// Start new session for new track
		await upsertPlaybackSession(account.user_id, {
			user_id: account.user_id,
			provider: 'spotify',
			track_uri: trackUri,
			started_at: now,
			last_seen_at: now,
			last_progress_ms: progressMs,
			accumulated_ms: 0,
			is_playing: isPlaying,
			track_duration_ms: track.duration_ms,
			track_metadata: trackMetadata,
			scrobbled: false,
		})
		result.sessionUpdated = true
		return result
	} catch (error) {
		console.error(
			`[Playback] Error processing currently playing for account ${account.id}:`,
			error
		)
		result.error = true
		return result
	}
}
