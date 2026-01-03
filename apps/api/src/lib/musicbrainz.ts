/**
 * MusicBrainz API client with rate limiting
 *
 * Implements compliant rate limiting per MusicBrainz guidelines:
 * - Maximum 1 request per second per IP address
 * - Proper User-Agent header required
 * - Handles 503 Service Unavailable with exponential backoff
 *
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 * @see https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
 */

import type {
	ArtistSearchResponse,
	IsrcLookupResponse,
	MusicBrainzRecordingDetails,
	RecordingSearchResponse,
	ReleaseSearchResponse,
} from '@playbacc/types/api/musicbrainz'

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2'

const _userAgent = process.env.MUSICBRAINZ_USER_AGENT
if (!_userAgent) {
	throw new Error(
		'MUSICBRAINZ_USER_AGENT is not set in environment variables. ' +
			'Format: AppName/Version (contact-url-or-email)'
	)
}
const USER_AGENT = _userAgent

/**
 * Rate limiter configuration
 */
const RATE_LIMIT_CONFIG = {
	/** Minimum interval between requests in milliseconds (1 request/sec) */
	minIntervalMs: 1100, // Slightly over 1 second to be safe
	/** Maximum retry attempts for 503 errors and transient network errors */
	maxRetries: 5,
	/** Base backoff delay in milliseconds */
	baseBackoffMs: 2000,
	/** Maximum backoff delay in milliseconds */
	maxBackoffMs: 60000,
	/** Jitter factor (±20%) */
	jitterFactor: 0.2,
}

/**
 * Simple serial queue for rate limiting.
 * Ensures requests are processed one at a time with minimum interval.
 */
class RateLimitQueue {
	private lastRequestTime = 0
	private queue: Array<{
		resolve: (value: void) => void
		reject: (error: Error) => void
	}> = []
	private processing = false

	/**
	 * Acquires a slot in the rate limit queue.
	 * Resolves when it's safe to make a request.
	 */
	async acquire(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.queue.push({ resolve, reject })
			this.processQueue()
		})
	}

	private async processQueue(): Promise<void> {
		if (this.processing || this.queue.length === 0) {
			return
		}

		this.processing = true

		while (this.queue.length > 0) {
			const item = this.queue.shift()!

			// Calculate wait time
			const now = Date.now()
			const timeSinceLastRequest = now - this.lastRequestTime
			const waitTime =
				RATE_LIMIT_CONFIG.minIntervalMs - timeSinceLastRequest

			if (waitTime > 0) {
				await new Promise((r) => setTimeout(r, waitTime))
			}

			this.lastRequestTime = Date.now()
			item.resolve()
		}

		this.processing = false
	}
}

const rateLimitQueue = new RateLimitQueue()

/**
 * Adds jitter to a delay value
 * @param delay - Base delay in milliseconds
 * @returns Delay with random jitter applied
 */
function addJitter(delay: number): number {
	const jitter = delay * RATE_LIMIT_CONFIG.jitterFactor
	return delay + (Math.random() * 2 - 1) * jitter
}

/**
 * Calculates exponential backoff delay with jitter
 * @param attempt - Current retry attempt (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number): number {
	const exponentialDelay =
		RATE_LIMIT_CONFIG.baseBackoffMs * Math.pow(2, attempt)
	const cappedDelay = Math.min(
		exponentialDelay,
		RATE_LIMIT_CONFIG.maxBackoffMs
	)
	return addJitter(cappedDelay)
}

/**
 * Checks if an error is a transient network error that should be retried.
 */
function isTransientError(error: unknown): boolean {
	if (error instanceof Error) {
		const code = (error as NodeJS.ErrnoException).code
		// Common transient network errors
		return (
			code === 'ECONNRESET' ||
			code === 'ETIMEDOUT' ||
			code === 'ECONNREFUSED' ||
			code === 'ENOTFOUND' ||
			code === 'EAI_AGAIN' ||
			error.message.includes('socket') ||
			error.message.includes('network')
		)
	}
	return false
}

/**
 * Makes a rate-limited fetch request to the MusicBrainz API.
 * Handles 503 errors and transient network errors with exponential backoff and retry.
 *
 * @param url - Full URL to fetch
 * @param attempt - Current retry attempt (internal use)
 * @returns Response object
 * @throws Error if all retries exhausted or non-recoverable error
 */
async function rateLimitedFetch(url: string, attempt = 0): Promise<Response> {
	// Wait for our turn in the queue
	await rateLimitQueue.acquire()

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/json',
			},
		})

		// Handle rate limiting / server overload (503)
		if (response.status === 503) {
			if (attempt >= RATE_LIMIT_CONFIG.maxRetries) {
				console.error(
					`[MusicBrainz] Max retries (${RATE_LIMIT_CONFIG.maxRetries}) exhausted for ${url}`
				)
				throw new Error(
					`MusicBrainz API unavailable after ${RATE_LIMIT_CONFIG.maxRetries} retries`
				)
			}

			const backoffMs = calculateBackoff(attempt)
			console.warn(
				`[MusicBrainz] 503 received, backing off for ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries})`
			)

			await new Promise((resolve) => setTimeout(resolve, backoffMs))
			return rateLimitedFetch(url, attempt + 1)
		}

		return response
	} catch (error) {
		// Transient network errors - retry with backoff
		if (isTransientError(error) && attempt < RATE_LIMIT_CONFIG.maxRetries) {
			const backoffMs = calculateBackoff(attempt)
			const errorCode = (error as NodeJS.ErrnoException).code ?? 'unknown'
			console.warn(
				`[MusicBrainz] Network error (${errorCode}), retrying in ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries})`
			)
			await new Promise((resolve) => setTimeout(resolve, backoffMs))
			return rateLimitedFetch(url, attempt + 1)
		}

		// Non-transient errors or max retries exceeded
		if (attempt >= RATE_LIMIT_CONFIG.maxRetries) {
			console.error(
				`[MusicBrainz] Max retries exhausted for network error:`,
				error
			)
		}
		throw error
	}
}

/**
 * Look up recordings by ISRC code.
 * ISRC is the most reliable way to match tracks to MusicBrainz.
 *
 * @param isrc - The ISRC code to look up
 * @returns The MusicBrainz recording ID (MBID) or null if not found
 */
export async function lookupTrackByIsrc(isrc: string): Promise<string | null> {
	try {
		const url = `${MUSICBRAINZ_API_BASE}/isrc/${encodeURIComponent(isrc)}?fmt=json`
		const response = await rateLimitedFetch(url)

		if (!response.ok) {
			if (response.status === 404) {
				return null
			}
			throw new Error(`MusicBrainz API error: ${response.status}`)
		}

		const data = (await response.json()) as IsrcLookupResponse

		if (data.recordings && data.recordings.length > 0) {
			return data.recordings[0].id
		}

		return null
	} catch (error) {
		console.error('[MusicBrainz] Error looking up track by ISRC:', error)
		return null
	}
}

/**
 * Search for a recording by title and artist name.
 * Used as a fallback when ISRC is not available.
 *
 * @param title - The recording/track title
 * @param artistName - The primary artist name
 * @param albumTitle - Optional album title for more precise matching
 * @returns The MusicBrainz recording ID (MBID) or null if not found
 */
export async function searchRecording(
	title: string,
	artistName: string,
	albumTitle?: string
): Promise<string | null> {
	try {
		// Build search query
		// Escape special Lucene characters in user input
		const escapeQuery = (str: string) =>
			str.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')

		let query = `recording:"${escapeQuery(title)}" AND artist:"${escapeQuery(artistName)}"`
		if (albumTitle) {
			query += ` AND release:"${escapeQuery(albumTitle)}"`
		}

		const url = `${MUSICBRAINZ_API_BASE}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`
		const response = await rateLimitedFetch(url)

		if (!response.ok) {
			throw new Error(`MusicBrainz API error: ${response.status}`)
		}

		const data = (await response.json()) as RecordingSearchResponse

		if (data.recordings && data.recordings.length > 0) {
			// Only return if we have a reasonably confident match (score > 80)
			const topResult = data.recordings[0]
			if (topResult.score && topResult.score < 80) {
				console.warn(
					`[MusicBrainz] Low confidence match (${topResult.score}) for "${title}" by "${artistName}"`
				)
				return null
			}
			return topResult.id
		}

		return null
	} catch (error) {
		console.error('[MusicBrainz] Error searching for recording:', error)
		return null
	}
}

/**
 * Get full recording details by MBID, including artist credits and releases.
 *
 * @param recordingMbid - The MusicBrainz recording ID
 * @returns Full recording details or null if not found
 */
export async function getRecordingDetails(
	recordingMbid: string
): Promise<MusicBrainzRecordingDetails | null> {
	try {
		const url = `${MUSICBRAINZ_API_BASE}/recording/${encodeURIComponent(recordingMbid)}?inc=artist-credits+releases+isrcs&fmt=json`
		const response = await rateLimitedFetch(url)

		if (!response.ok) {
			if (response.status === 404) {
				return null
			}
			throw new Error(`MusicBrainz API error: ${response.status}`)
		}

		return (await response.json()) as MusicBrainzRecordingDetails
	} catch (error) {
		console.error('[MusicBrainz] Error getting recording details:', error)
		return null
	}
}

/**
 * Look up artist by name.
 *
 * @param name - The artist name to search for
 * @returns The MusicBrainz artist ID (MBID) or null if not found
 */
export async function lookupArtistByName(name: string): Promise<string | null> {
	try {
		const escapeQuery = (str: string) =>
			str.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')

		const query = encodeURIComponent(`artist:"${escapeQuery(name)}"`)
		const url = `${MUSICBRAINZ_API_BASE}/artist/?query=${query}&fmt=json&limit=1`
		const response = await rateLimitedFetch(url)

		if (!response.ok) {
			throw new Error(`MusicBrainz API error: ${response.status}`)
		}

		const data = (await response.json()) as ArtistSearchResponse

		if (data.artists && data.artists.length > 0) {
			return data.artists[0].id
		}

		return null
	} catch (error) {
		console.error('[MusicBrainz] Error looking up artist by name:', error)
		return null
	}
}

/**
 * Look up release/album by name and artist.
 *
 * @param releaseName - The release/album name to search for
 * @param artistName - The artist name to filter by
 * @returns The MusicBrainz release ID (MBID) or null if not found
 */
export async function lookupReleaseByNameAndArtist(
	releaseName: string,
	artistName: string
): Promise<string | null> {
	try {
		const escapeQuery = (str: string) =>
			str.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')

		const query = encodeURIComponent(
			`release:"${escapeQuery(releaseName)}" AND artist:"${escapeQuery(artistName)}"`
		)
		const url = `${MUSICBRAINZ_API_BASE}/release/?query=${query}&fmt=json&limit=1`
		const response = await rateLimitedFetch(url)

		if (!response.ok) {
			throw new Error(`MusicBrainz API error: ${response.status}`)
		}

		const data = (await response.json()) as ReleaseSearchResponse

		if (data.releases && data.releases.length > 0) {
			return data.releases[0].id
		}

		return null
	} catch (error) {
		console.error(
			'[MusicBrainz] Error looking up release by name and artist:',
			error
		)
		return null
	}
}

/**
 * Cover Art Archive API response
 * @see https://wiki.musicbrainz.org/Cover_Art_Archive/API
 */
interface CoverArtArchiveResponse {
	images: Array<{
		/** URL to the full-size image */
		image: string
		/** Array of image types (e.g., "Front", "Back") */
		types: string[]
		/** Whether this is the front cover */
		front: boolean
		/** Whether this is the back cover */
		back: boolean
		/** Thumbnails at various sizes */
		thumbnails: {
			small?: string
			large?: string
			'250'?: string
			'500'?: string
			'1200'?: string
		}
	}>
	release: string
}

/**
 * Fetches album cover art from the Cover Art Archive.
 * CAA is the official source for MusicBrainz cover art.
 *
 * Note: CAA has its own rate limiting, but is generally more lenient than MB.
 * We still use a simple fetch with retry for reliability.
 *
 * @param releaseMbid - MusicBrainz release ID
 * @returns URL to the best available cover image, or null if not found
 * @see https://coverartarchive.org/
 */
export async function getReleaseCoverUrl(
	releaseMbid: string
): Promise<string | null> {
	try {
		const url = `https://coverartarchive.org/release/${encodeURIComponent(releaseMbid)}`
		const response = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/json',
			},
		})

		// 404 means no cover art available
		if (response.status === 404) {
			return null
		}

		if (!response.ok) {
			// Don't error out the pipeline for cover art failures
			console.warn(
				`[CoverArt] Failed to fetch cover for ${releaseMbid}: ${response.status}`
			)
			return null
		}

		const data = (await response.json()) as CoverArtArchiveResponse

		if (!data.images || data.images.length === 0) {
			return null
		}

		// Find the best image:
		// 1. Prefer front cover
		// 2. Use largest available thumbnail (1200 > 500 > 250 > large > small)
		// 3. Fallback to full image URL

		const frontImage = data.images.find((img) => img.front)
		const bestImage = frontImage ?? data.images[0]

		// Prefer high-quality thumbnail over full image (faster loading)
		const imageUrl =
			bestImage.thumbnails['1200'] ??
			bestImage.thumbnails['500'] ??
			bestImage.thumbnails.large ??
			bestImage.thumbnails['250'] ??
			bestImage.image

		return imageUrl
	} catch (error) {
		// Don't fail scrobbling if cover art fetch fails
		console.warn(
			`[CoverArt] Error fetching cover for ${releaseMbid}:`,
			error
		)
		return null
	}
}

/**
 * In-memory cache for MusicBrainz lookups within a single worker run.
 * Reduces redundant API calls for repeated tracks/artists.
 */
export class MusicBrainzCache {
	private isrcToMbid = new Map<string, string | null>()
	private searchKeyToMbid = new Map<string, string | null>()
	private mbidToDetails = new Map<
		string,
		MusicBrainzRecordingDetails | null
	>()
	private releaseCoverUrls = new Map<string, string | null>()

	/**
	 * Creates a cache key for recording search
	 */
	private makeSearchKey(
		title: string,
		artist: string,
		album?: string
	): string {
		return `${title.toLowerCase()}|${artist.toLowerCase()}|${album?.toLowerCase() ?? ''}`
	}

	/**
	 * Look up recording by ISRC with caching
	 */
	async lookupByIsrc(isrc: string): Promise<string | null> {
		if (this.isrcToMbid.has(isrc)) {
			return this.isrcToMbid.get(isrc)!
		}

		const mbid = await lookupTrackByIsrc(isrc)
		this.isrcToMbid.set(isrc, mbid)
		return mbid
	}

	/**
	 * Search for recording with caching
	 */
	async searchRecordingCached(
		title: string,
		artist: string,
		album?: string
	): Promise<string | null> {
		const key = this.makeSearchKey(title, artist, album)
		if (this.searchKeyToMbid.has(key)) {
			return this.searchKeyToMbid.get(key)!
		}

		const mbid = await searchRecording(title, artist, album)
		this.searchKeyToMbid.set(key, mbid)
		return mbid
	}

	/**
	 * Get recording details with caching
	 */
	async getDetailsCached(
		mbid: string
	): Promise<MusicBrainzRecordingDetails | null> {
		if (this.mbidToDetails.has(mbid)) {
			return this.mbidToDetails.get(mbid)!
		}

		const details = await getRecordingDetails(mbid)
		this.mbidToDetails.set(mbid, details)
		return details
	}

	/**
	 * Get release cover URL with caching
	 */
	async getReleaseCoverUrlCached(
		releaseMbid: string
	): Promise<string | null> {
		if (this.releaseCoverUrls.has(releaseMbid)) {
			return this.releaseCoverUrls.get(releaseMbid)!
		}

		const coverUrl = await getReleaseCoverUrl(releaseMbid)
		this.releaseCoverUrls.set(releaseMbid, coverUrl)
		return coverUrl
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.isrcToMbid.clear()
		this.searchKeyToMbid.clear()
		this.mbidToDetails.clear()
		this.releaseCoverUrls.clear()
	}

	/**
	 * Get cache statistics for logging
	 */
	getStats(): {
		isrc: number
		search: number
		details: number
		covers: number
	} {
		return {
			isrc: this.isrcToMbid.size,
			search: this.searchKeyToMbid.size,
			details: this.mbidToDetails.size,
			covers: this.releaseCoverUrls.size,
		}
	}
}
