/**
 * Scrobble Worker
 *
 * Background service that tracks listening history from Spotify via two loops:
 *
 * 1. **Fast loop (currently-playing)**: Polls Spotify's currently-playing endpoint
 *    every ~8 seconds for real-time playback tracking. This enables:
 *    - Scrobbling skipped tracks (that meet minimum duration)
 *    - Detecting looped/repeated tracks via progress wrap
 *    - Pause-aware duration tracking
 *
 * 2. **Slow loop (recently-played fallback)**: Polls Spotify's recently-played endpoint
 *    at a configurable interval (~60s default) as a safety net to catch any plays
 *    that may have been missed.
 *
 * Both loops share a MusicBrainz cache for efficient metadata resolution.
 *
 * @module worker/scrobble-worker
 */

import {
	getEligibleAccounts,
	processAccountScrobbles,
	SCROBBLE_CONFIG,
} from '../lib/scrobbles'
import { MusicBrainzCache } from '../lib/musicbrainz'
import { processCurrentlyPlaying, PLAYBACK_CONFIG } from '../lib/playback'
import type { SpotifyAccount } from '../lib/spotify'

/**
 * Worker configuration
 */
const WORKER_CONFIG = {
	/** Polling interval for recently-played fallback (ms) */
	recentlyPlayedIntervalMs: parseInt(
		process.env.SCROBBLE_POLL_INTERVAL_MS || '60000',
		10
	),
	/** Polling interval for currently-playing (ms) - from playback config */
	currentlyPlayingIntervalMs: PLAYBACK_CONFIG.pollIntervalMs,
	/** Jitter factor (±10% of poll interval) */
	jitterFactor: 0.1,
}

/** Flag to track if worker should continue running */
let isRunning = true

/**
 * Adds random jitter to a delay value to avoid synchronized requests.
 * This follows MusicBrainz guidelines to spread load across time.
 *
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay with jitter applied
 */
function addJitter(baseDelayMs: number): number {
	const jitter = baseDelayMs * WORKER_CONFIG.jitterFactor
	return baseDelayMs + (Math.random() * 2 - 1) * jitter
}

/**
 * Sleeps for a specified duration, but can be interrupted by shutdown
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Processes all accounts via the currently-playing endpoint.
 * This is the fast loop for real-time playback tracking.
 *
 * @param accounts - Array of accounts to process
 * @param mbCache - Shared MusicBrainz cache
 * @returns Aggregated statistics
 */
async function processCurrentlyPlayingLoop(
	accounts: SpotifyAccount[],
	mbCache: MusicBrainzCache
): Promise<{
	scrobbled: number
	sessionsUpdated: number
	errors: number
}> {
	const stats = {
		scrobbled: 0,
		sessionsUpdated: 0,
		errors: 0,
	}

	for (const account of accounts) {
		if (!isRunning) break

		try {
			const result = await processCurrentlyPlaying(account, mbCache)
			if (result.scrobbled) stats.scrobbled++
			if (result.sessionUpdated) stats.sessionsUpdated++
			if (result.error) stats.errors++
		} catch (error) {
			stats.errors++
			console.error(
				`[Worker:FastLoop] Error processing account ${account.id}:`,
				error
			)
		}
	}

	return stats
}

/**
 * Processes accounts via the recently-played endpoint (fallback).
 *
 * @param accounts - Array of accounts to process
 * @param mbCache - Shared MusicBrainz cache
 * @returns Aggregated statistics
 */
async function processRecentlyPlayedLoop(
	accounts: SpotifyAccount[],
	mbCache: MusicBrainzCache
): Promise<{
	totalFetched: number
	totalScrobbled: number
	totalSkipped: number
	totalErrors: number
}> {
	const stats = {
		totalFetched: 0,
		totalScrobbled: 0,
		totalSkipped: 0,
		totalErrors: 0,
	}

	// Process accounts sequentially to respect MusicBrainz rate limits
	for (const account of accounts) {
		if (!isRunning) break

		try {
			const result = await processAccountScrobbles(account, mbCache)
			stats.totalFetched += result.fetched
			stats.totalScrobbled += result.scrobbled
			stats.totalSkipped += result.skipped
			stats.totalErrors += result.errors
		} catch (error) {
			stats.totalErrors++
			console.error(
				`[Worker:SlowLoop] Error processing account ${account.id}:`,
				error
			)
		}
	}

	return stats
}

/**
 * Fast loop: Polls currently-playing for all accounts.
 * Runs every ~8 seconds for real-time playback tracking.
 */
async function runFastLoop(mbCache: MusicBrainzCache): Promise<void> {
	console.log('[Worker:FastLoop] Starting currently-playing loop...')

	while (isRunning) {
		const startTime = Date.now()

		try {
			const accounts = await getEligibleAccounts()

			if (accounts.length > 0) {
				const stats = await processCurrentlyPlayingLoop(
					accounts,
					mbCache
				)

				if (stats.scrobbled > 0 || stats.errors > 0) {
					console.log(
						`[Worker:FastLoop] Poll complete: scrobbled=${stats.scrobbled}, ` +
							`sessions=${stats.sessionsUpdated}, errors=${stats.errors}`
					)
				}
			}
		} catch (error) {
			console.error('[Worker:FastLoop] Error in poll cycle:', error)
		}

		// Wait for next poll
		const elapsed = Date.now() - startTime
		const sleepTime = Math.max(
			0,
			addJitter(WORKER_CONFIG.currentlyPlayingIntervalMs) - elapsed
		)

		if (isRunning && sleepTime > 0) {
			await sleep(sleepTime)
		}
	}

	console.log('[Worker:FastLoop] Stopped')
}

/**
 * Slow loop: Polls recently-played as a fallback.
 * Runs at the configured interval (~60s default) to catch missed plays.
 */
async function runSlowLoop(mbCache: MusicBrainzCache): Promise<void> {
	console.log('[Worker:SlowLoop] Starting recently-played fallback loop...')

	// Initial run
	await runSlowLoopOnce(mbCache)

	while (isRunning) {
		const sleepDuration = addJitter(WORKER_CONFIG.recentlyPlayedIntervalMs)
		console.log(
			`[Worker:SlowLoop] Next fallback cycle in ${(sleepDuration / 1000).toFixed(1)}s`
		)

		await sleep(sleepDuration)

		if (isRunning) {
			await runSlowLoopOnce(mbCache)
		}
	}

	console.log('[Worker:SlowLoop] Stopped')
}

/**
 * Executes a single slow loop cycle.
 */
async function runSlowLoopOnce(mbCache: MusicBrainzCache): Promise<void> {
	const startTime = Date.now()
	console.log('[Worker:SlowLoop] Starting fallback cycle...')

	try {
		const accounts = await getEligibleAccounts()

		if (accounts.length === 0) {
			console.log('[Worker:SlowLoop] No eligible accounts found')
			return
		}

		const stats = await processRecentlyPlayedLoop(accounts, mbCache)

		const duration = ((Date.now() - startTime) / 1000).toFixed(1)
		const cacheStats = mbCache.getStats()

		console.log(
			`[Worker:SlowLoop] Cycle complete in ${duration}s: ` +
				`fetched=${stats.totalFetched}, scrobbled=${stats.totalScrobbled}, ` +
				`skipped=${stats.totalSkipped}, errors=${stats.totalErrors}`
		)
		console.log(
			`[Worker:SlowLoop] MB cache stats: isrc=${cacheStats.isrc}, search=${cacheStats.search}, details=${cacheStats.details}`
		)
	} catch (error) {
		console.error('[Worker:SlowLoop] Error in fallback cycle:', error)
	}
}

/**
 * Main worker entry point.
 * Starts both the fast (currently-playing) and slow (recently-played) loops.
 */
async function main(): Promise<void> {
	console.log('[Worker] Scrobble worker starting...')
	console.log(
		`[Worker] Config: ` +
			`currentlyPlayingInterval=${WORKER_CONFIG.currentlyPlayingIntervalMs}ms, ` +
			`recentlyPlayedInterval=${WORKER_CONFIG.recentlyPlayedIntervalMs}ms, ` +
			`minPlaySeconds=${SCROBBLE_CONFIG.minPlaySeconds}s OR minPlayPercent=${SCROBBLE_CONFIG.minPlayPercent}%`
	)

	// Set up graceful shutdown
	const shutdown = () => {
		console.log('[Worker] Shutdown signal received, stopping loops...')
		isRunning = false
	}

	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)

	// Create a shared MusicBrainz cache for both loops
	// This improves cache hit rates when both loops process the same tracks
	const mbCache = new MusicBrainzCache()

	// Run both loops concurrently
	await Promise.all([runFastLoop(mbCache), runSlowLoop(mbCache)])

	console.log('[Worker] Scrobble worker stopped')
}

// Run the worker
main().catch((error) => {
	console.error('[Worker] Fatal error:', error)
	process.exit(1)
})
