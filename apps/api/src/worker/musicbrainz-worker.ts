/**
 * MusicBrainz Enrichment Worker
 *
 * Background service that processes MusicBrainz enrichment jobs:
 * - Resolves missing MBIDs for artists, albums, and tracks
 * - Syncs artist relationships (group memberships)
 * - Refreshes stale metadata from MusicBrainz
 *
 * Uses conservative rate limiting to stay well under MusicBrainz's
 * 1 request/second guideline, allowing the scrobble worker to have priority.
 *
 * @module worker/musicbrainz-worker
 */

import { db } from '../db'
import { eq } from 'drizzle-orm'
import { artists, albums, tracks, track_artists } from '@playbacc/types/db/schema'
import {
	claimJobs,
	completeJob,
	failJob,
	cleanupOldJobs,
	type MbEnrichmentJob,
	type MbEnrichmentJobType,
	QUEUE_CONFIG,
} from '../lib/mb-enrichment-queue'
import {
	syncArtistRelationshipsByMbid,
	syncTrackById,
	syncAlbumById,
} from '../lib/sync'
import {
	lookupArtistByName,
	lookupReleaseByNameAndArtist,
	lookupTrackByIsrc,
	searchRecording,
} from '../lib/musicbrainz'

// =============================================================================
// Configuration
// =============================================================================

const WORKER_CONFIG = {
	/** Unique worker ID for this instance */
	workerId: `mb-worker-${process.pid}-${Date.now()}`,
	/** Batch size for claiming jobs */
	batchSize: parseInt(process.env.MB_WORKER_BATCH_SIZE || '25', 10),
	/** Delay between processing jobs in milliseconds (conservative rate limiting) */
	jobDelayMs: parseInt(process.env.MB_WORKER_JOB_DELAY_MS || '3000', 10),
	/** Delay between poll cycles when no jobs found (ms) */
	pollIntervalMs: parseInt(process.env.MB_WORKER_POLL_INTERVAL_MS || '30000', 10),
	/** Cleanup interval in milliseconds (1 hour) */
	cleanupIntervalMs: parseInt(process.env.MB_WORKER_CLEANUP_INTERVAL_MS || '3600000', 10),
	/** Jitter factor (±10% of delays) */
	jitterFactor: 0.1,
}

/** Flag to track if worker should continue running */
let isRunning = true

/** Last cleanup timestamp */
let lastCleanupTime = 0

// =============================================================================
// Helpers
// =============================================================================

/**
 * Adds random jitter to a delay value.
 *
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay with jitter applied
 */
function addJitter(baseDelayMs: number): number {
	const jitter = baseDelayMs * WORKER_CONFIG.jitterFactor
	return baseDelayMs + (Math.random() * 2 - 1) * jitter
}

/**
 * Sleeps for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// Job Processors
// =============================================================================

/**
 * Processes a single job based on its type.
 *
 * @param job - Job to process
 * @returns True if successful, false otherwise
 */
async function processJob(job: MbEnrichmentJob): Promise<{ success: boolean; error?: string }> {
	try {
		switch (job.job_type) {
			case 'artist.resolve_mbid':
				return await processArtistResolveMbid(job.entity_id)

			case 'artist.sync_relationships':
				return await processArtistSyncRelationships(job.entity_id)

			case 'album.resolve_mbid':
				return await processAlbumResolveMbid(job.entity_id)

			case 'album.sync':
				return await processAlbumSync(job.entity_id)

			case 'track.resolve_mbid':
				return await processTrackResolveMbid(job.entity_id)

			case 'track.sync':
				return await processTrackSync(job.entity_id)

			default:
				return { success: false, error: `Unknown job type: ${job.job_type}` }
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { success: false, error: message }
	}
}

/**
 * Resolves MBID for an artist by name lookup.
 */
async function processArtistResolveMbid(
	artistId: string
): Promise<{ success: boolean; error?: string }> {
	const artist = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.id, artistId),
	})

	if (!artist) {
		return { success: false, error: 'Artist not found' }
	}

	if (artist.mbid) {
		// Already has MBID, nothing to do
		return { success: true }
	}

	const mbid = await lookupArtistByName(artist.name)
	if (!mbid) {
		return { success: false, error: `No MusicBrainz match found for artist: ${artist.name}` }
	}

	await db.update(artists).set({ mbid }).where(eq(artists.id, artistId))

	console.log(`[MbWorker] Resolved artist MBID: ${artist.name} -> ${mbid}`)
	return { success: true }
}

/**
 * Syncs artist relationships from MusicBrainz.
 */
async function processArtistSyncRelationships(
	artistId: string
): Promise<{ success: boolean; error?: string }> {
	const artist = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.id, artistId),
	})

	if (!artist) {
		return { success: false, error: 'Artist not found' }
	}

	if (!artist.mbid) {
		return { success: false, error: 'Artist has no MBID - cannot sync relationships' }
	}

	const result = await syncArtistRelationshipsByMbid(artist.mbid)

	if (result.errors.length > 0) {
		return { success: false, error: result.errors.join('; ') }
	}

	console.log(
		`[MbWorker] Synced artist relationships: ${artist.name} ` +
			`(type=${result.artistType}, memberships=${result.membershipsInserted}/${result.membershipsProcessed})`
	)
	return { success: true }
}

/**
 * Resolves MBID for an album by release lookup.
 */
async function processAlbumResolveMbid(
	albumId: string
): Promise<{ success: boolean; error?: string }> {
	const album = await db.query.albums.findFirst({
		where: (a, { eq }) => eq(a.id, albumId),
		with: {
			// We need artist name for lookup
		},
	})

	if (!album) {
		return { success: false, error: 'Album not found' }
	}

	if (album.mbid) {
		// Already has MBID
		return { success: true }
	}

	// Get artist name for lookup
	const artist = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.id, album.artist_id),
	})

	if (!artist) {
		return { success: false, error: 'Album artist not found' }
	}

	const mbid = await lookupReleaseByNameAndArtist(album.title, artist.name)
	if (!mbid) {
		return {
			success: false,
			error: `No MusicBrainz match found for album: ${album.title} by ${artist.name}`,
		}
	}

	await db.update(albums).set({ mbid }).where(eq(albums.id, albumId))

	console.log(`[MbWorker] Resolved album MBID: ${album.title} -> ${mbid}`)
	return { success: true }
}

/**
 * Syncs album metadata from MusicBrainz.
 */
async function processAlbumSync(albumId: string): Promise<{ success: boolean; error?: string }> {
	const result = await syncAlbumById(albumId)

	if (result.errors.length > 0) {
		return { success: false, error: result.errors.join('; ') }
	}

	if (!result.found) {
		return { success: false, error: 'Album not found in MusicBrainz' }
	}

	console.log(
		`[MbWorker] Synced album: id=${albumId}, updated=${result.updated}, cover=${result.coverArtFetched}`
	)
	return { success: true }
}

/**
 * Resolves MBID for a track by ISRC or search.
 */
async function processTrackResolveMbid(
	trackId: string
): Promise<{ success: boolean; error?: string }> {
	const track = await db.query.tracks.findFirst({
		where: (t, { eq }) => eq(t.id, trackId),
	})

	if (!track) {
		return { success: false, error: 'Track not found' }
	}

	if (track.mbid) {
		// Already has MBID
		return { success: true }
	}

	let mbid: string | null = null

	// Try ISRC lookup first (most reliable)
	if (track.isrc) {
		mbid = await lookupTrackByIsrc(track.isrc)
	}

	// Fallback to search if ISRC lookup failed
	if (!mbid) {
		// Get primary artist for search
		const trackArtist = await db.query.track_artists.findFirst({
			where: (ta, { eq, and }) => and(eq(ta.track_id, trackId), eq(ta.is_primary, true)),
		})

		if (trackArtist) {
			const artist = await db.query.artists.findFirst({
				where: (a, { eq }) => eq(a.id, trackArtist.artist_id),
			})

			if (artist) {
				mbid = await searchRecording(track.title, artist.name)
			}
		}
	}

	if (!mbid) {
		return { success: false, error: `No MusicBrainz match found for track: ${track.title}` }
	}

	await db.update(tracks).set({ mbid }).where(eq(tracks.id, trackId))

	console.log(`[MbWorker] Resolved track MBID: ${track.title} -> ${mbid}`)
	return { success: true }
}

/**
 * Syncs track metadata from MusicBrainz.
 */
async function processTrackSync(trackId: string): Promise<{ success: boolean; error?: string }> {
	const result = await syncTrackById(trackId)

	if (result.errors.length > 0) {
		return { success: false, error: result.errors.join('; ') }
	}

	if (!result.found) {
		return { success: false, error: 'Track not found in MusicBrainz' }
	}

	console.log(`[MbWorker] Synced track: id=${trackId}, updated=${result.updated}`)
	return { success: true }
}

// =============================================================================
// Main Loop
// =============================================================================

/**
 * Runs the TTL cleanup if enough time has passed.
 */
async function maybeRunCleanup(): Promise<void> {
	const now = Date.now()
	if (now - lastCleanupTime < WORKER_CONFIG.cleanupIntervalMs) {
		return
	}

	lastCleanupTime = now
	console.log('[MbWorker] Running TTL cleanup...')

	try {
		const deleted = await cleanupOldJobs()
		if (deleted > 0) {
			console.log(`[MbWorker] Cleaned up ${deleted} old jobs (TTL: ${QUEUE_CONFIG.jobTtlDays} days)`)
		}
	} catch (error) {
		console.error('[MbWorker] Cleanup error:', error)
	}
}

/**
 * Main worker loop.
 * Claims jobs in batches and processes them with conservative throttling.
 */
async function runWorkerLoop(): Promise<void> {
	console.log('[MbWorker] Starting main loop...')

	while (isRunning) {
		try {
			// Run cleanup periodically
			await maybeRunCleanup()

			// Claim a batch of jobs
			const jobs = await claimJobs(WORKER_CONFIG.workerId, WORKER_CONFIG.batchSize)

			if (jobs.length === 0) {
				// No jobs available, wait before next poll
				const sleepTime = addJitter(WORKER_CONFIG.pollIntervalMs)
				await sleep(sleepTime)
				continue
			}

			console.log(`[MbWorker] Claimed ${jobs.length} jobs`)

			// Process each job with throttling
			for (const job of jobs) {
				if (!isRunning) break

				const startTime = Date.now()

				try {
					const result = await processJob(job)

					if (result.success) {
						await completeJob(job.id)
					} else {
						await failJob(job.id, result.error || 'Unknown error')
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					console.error(`[MbWorker] Error processing job ${job.id}:`, error)
					await failJob(job.id, message)
				}

				// Throttle: wait between jobs to stay under MusicBrainz rate limit
				const elapsed = Date.now() - startTime
				const sleepTime = Math.max(0, addJitter(WORKER_CONFIG.jobDelayMs) - elapsed)
				if (sleepTime > 0 && isRunning) {
					await sleep(sleepTime)
				}
			}
		} catch (error) {
			console.error('[MbWorker] Error in main loop:', error)
			// Wait before retrying on error
			await sleep(addJitter(WORKER_CONFIG.pollIntervalMs))
		}
	}

	console.log('[MbWorker] Main loop stopped')
}

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Main worker entry point.
 */
async function main(): Promise<void> {
	console.log('[MbWorker] MusicBrainz enrichment worker starting...')
	console.log(
		`[MbWorker] Config: ` +
			`batchSize=${WORKER_CONFIG.batchSize}, ` +
			`jobDelayMs=${WORKER_CONFIG.jobDelayMs}, ` +
			`pollIntervalMs=${WORKER_CONFIG.pollIntervalMs}, ` +
			`cleanupIntervalMs=${WORKER_CONFIG.cleanupIntervalMs}, ` +
			`jobTtlDays=${QUEUE_CONFIG.jobTtlDays}`
	)

	// Set up graceful shutdown
	const shutdown = () => {
		console.log('[MbWorker] Shutdown signal received, stopping...')
		isRunning = false
	}

	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)

	// Run the worker loop
	await runWorkerLoop()

	console.log('[MbWorker] MusicBrainz enrichment worker stopped')
}

// Run the worker
main().catch((error) => {
	console.error('[MbWorker] Fatal error:', error)
	process.exit(1)
})

