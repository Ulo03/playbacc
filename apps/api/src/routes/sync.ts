/**
 * MusicBrainz Sync Routes
 *
 * Provides endpoints for:
 * - Searching MusicBrainz for candidates (artists, releases)
 * - Enqueueing sync jobs for background processing
 * - Viewing job status and queue statistics
 *
 * All endpoints require authentication.
 *
 * @module routes/sync
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { searchArtists, searchReleases } from '../lib/musicbrainz'
import {
	enqueueJob,
	enqueueJobs,
	getJob,
	getQueueStats,
	getJobsForEntity,
	type MbEnrichmentJobType,
	type MbEnrichmentEntityType,
} from '../lib/mb-enrichment-queue'
import { db } from '../db'

const sync = new Hono()

// Apply authentication to all routes
sync.use('*', authenticate)

// =============================================================================
// Search Endpoints (no mutation, just returns candidates)
// =============================================================================

/**
 * GET /api/sync/search/artists
 *
 * Search MusicBrainz for artist candidates.
 * Query params:
 * - q: Search query (required)
 * - limit: Max results (default 10, max 25)
 */
sync.get('/search/artists', async (ctx) => {
	const query = ctx.req.query('q')
	const limitParam = ctx.req.query('limit')

	if (!query) {
		return ctx.json({ error: 'Missing query parameter: q' }, 400)
	}

	const limit = Math.min(parseInt(limitParam || '10', 10), 25)

	try {
		const results = await searchArtists(query, limit)

		return ctx.json({
			query,
			count: results.length,
			artists: results.map((a) => ({
				mbid: a.id,
				name: a.name,
				sortName: a['sort-name'],
				type: a.type,
				gender: a.gender,
				score: a.score,
				country: a.country,
				disambiguation: a.disambiguation,
				area: a.area?.name,
				lifeSpan: a['life-span'],
			})),
		})
	} catch (error) {
		console.error('[Sync] Error searching artists:', error)
		return ctx.json({ error: 'Search failed' }, 500)
	}
})

/**
 * GET /api/sync/search/releases
 *
 * Search MusicBrainz for release candidates.
 * Query params:
 * - q: Search query (required)
 * - artist: Optional artist name to narrow results
 * - limit: Max results (default 10, max 25)
 */
sync.get('/search/releases', async (ctx) => {
	const query = ctx.req.query('q')
	const artistName = ctx.req.query('artist')
	const limitParam = ctx.req.query('limit')

	if (!query) {
		return ctx.json({ error: 'Missing query parameter: q' }, 400)
	}

	const limit = Math.min(parseInt(limitParam || '10', 10), 25)

	try {
		const results = await searchReleases(query, artistName, limit)

		return ctx.json({
			query,
			artist: artistName,
			count: results.length,
			releases: results.map((r) => ({
				mbid: r.id,
				title: r.title,
				score: r.score,
				date: r.date,
				status: r.status,
				country: r.country,
				disambiguation: r.disambiguation,
				artistCredit: r['artist-credit']?.map((ac) => ({
					name: ac.name ?? ac.artist.name,
					mbid: ac.artist.id,
					joinPhrase: ac.joinphrase,
				})),
				releaseGroup: r['release-group']
					? {
							mbid: r['release-group'].id,
							title: r['release-group'].title,
							primaryType: r['release-group']['primary-type'],
							secondaryTypes: r['release-group']['secondary-types'],
						}
					: null,
				labelInfo: r['label-info']?.map((li) => ({
					catalogNumber: li['catalog-number'],
					label: li.label?.name,
				})),
				trackCount: r['track-count'],
			})),
		})
	} catch (error) {
		console.error('[Sync] Error searching releases:', error)
		return ctx.json({ error: 'Search failed' }, 500)
	}
})

// =============================================================================
// Job Status Endpoints
// =============================================================================

/**
 * GET /api/sync/jobs
 *
 * Get queue statistics.
 */
sync.get('/jobs', async (ctx) => {
	try {
		const stats = await getQueueStats()
		return ctx.json(stats)
	} catch (error) {
		console.error('[Sync] Error getting queue stats:', error)
		return ctx.json({ error: 'Failed to get queue stats' }, 500)
	}
})

/**
 * GET /api/sync/jobs/:id
 *
 * Get a specific job by ID.
 */
sync.get('/jobs/:id', async (ctx) => {
	const jobId = ctx.req.param('id')

	try {
		const job = await getJob(jobId)

		if (!job) {
			return ctx.json({ error: 'Job not found' }, 404)
		}

		return ctx.json(job)
	} catch (error) {
		console.error('[Sync] Error getting job:', error)
		return ctx.json({ error: 'Failed to get job' }, 500)
	}
})

// =============================================================================
// Artist Sync (Enqueue)
// =============================================================================

/**
 * POST /api/sync/artists/:id
 *
 * Enqueue a sync job for a single artist.
 * The artist must have an MBID for sync_relationships, otherwise resolve_mbid is enqueued.
 * Returns 202 Accepted with job info.
 */
sync.post('/artists/:id', async (ctx) => {
	const artistId = ctx.req.param('id')

	const artist = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.id, artistId),
	})

	if (!artist) {
		return ctx.json({ error: 'Artist not found' }, 404)
	}

	try {
		// Choose job type based on whether artist has MBID
		const jobType: MbEnrichmentJobType = artist.mbid
			? 'artist.sync_relationships'
			: 'artist.resolve_mbid'

		const result = await enqueueJob({
			jobType,
			entityType: 'artist',
			entityId: artistId,
			priority: 10, // Higher priority for manual requests
		})

		return ctx.json(
			{
				message: result.created ? 'Job enqueued' : 'Job already exists',
				jobId: result.jobId,
				jobType,
				entityId: artistId,
				entityName: artist.name,
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error enqueueing artist sync:', error)
		return ctx.json({ error: 'Failed to enqueue job' }, 500)
	}
})

/**
 * POST /api/sync/artists
 *
 * Enqueue sync jobs for multiple artists.
 * Query params:
 * - limit: Max artists to enqueue (default 10, max 50)
 * - type: 'sync' (default, for artists with MBID) or 'resolve' (for artists without MBID)
 */
sync.post('/artists', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const typeParam = ctx.req.query('type') || 'sync'
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		let artistsToEnqueue: Array<{ id: string; name: string; mbid: string | null }>

		if (typeParam === 'resolve') {
			// Find artists without MBIDs
			artistsToEnqueue = await db.query.artists.findMany({
				where: (a, { isNull }) => isNull(a.mbid),
				columns: { id: true, name: true, mbid: true },
				limit,
			})
		} else {
			// Find artists with MBIDs
			artistsToEnqueue = await db.query.artists.findMany({
				where: (a, { isNotNull }) => isNotNull(a.mbid),
				columns: { id: true, name: true, mbid: true },
				limit,
			})
		}

		const jobType: MbEnrichmentJobType =
			typeParam === 'resolve' ? 'artist.resolve_mbid' : 'artist.sync_relationships'

		const results = await enqueueJobs(
			artistsToEnqueue.map((artist) => ({
				jobType,
				entityType: 'artist' as MbEnrichmentEntityType,
				entityId: artist.id,
				priority: 5, // Medium priority for bulk requests
			}))
		)

		const created = results.filter((r) => r.created).length
		const skipped = results.filter((r) => !r.created).length

		return ctx.json(
			{
				message: `Enqueued ${created} jobs, ${skipped} already existed`,
				total: artistsToEnqueue.length,
				created,
				skipped,
				jobType,
				jobIds: results.filter((r) => r.created).map((r) => r.jobId),
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error in bulk artist enqueue:', error)
		return ctx.json({ error: 'Bulk enqueue failed' }, 500)
	}
})

// =============================================================================
// Album Sync (Enqueue)
// =============================================================================

/**
 * POST /api/sync/albums/:id
 *
 * Enqueue a sync job for a single album.
 * The album must have an MBID for sync, otherwise resolve_mbid is enqueued.
 * Returns 202 Accepted with job info.
 */
sync.post('/albums/:id', async (ctx) => {
	const albumId = ctx.req.param('id')

	const album = await db.query.albums.findFirst({
		where: (a, { eq }) => eq(a.id, albumId),
	})

	if (!album) {
		return ctx.json({ error: 'Album not found' }, 404)
	}

	try {
		// Choose job type based on whether album has MBID
		const jobType: MbEnrichmentJobType = album.mbid ? 'album.sync' : 'album.resolve_mbid'

		const result = await enqueueJob({
			jobType,
			entityType: 'album',
			entityId: albumId,
			priority: 10, // Higher priority for manual requests
		})

		return ctx.json(
			{
				message: result.created ? 'Job enqueued' : 'Job already exists',
				jobId: result.jobId,
				jobType,
				entityId: albumId,
				entityName: album.title,
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error enqueueing album sync:', error)
		return ctx.json({ error: 'Failed to enqueue job' }, 500)
	}
})

/**
 * POST /api/sync/albums
 *
 * Enqueue sync jobs for multiple albums.
 * Query params:
 * - limit: Max albums to enqueue (default 10, max 50)
 * - type: 'sync' (default, for albums with MBID) or 'resolve' (for albums without MBID)
 */
sync.post('/albums', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const typeParam = ctx.req.query('type') || 'sync'
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		let albumsToEnqueue: Array<{ id: string; title: string; mbid: string | null }>

		if (typeParam === 'resolve') {
			// Find albums without MBIDs
			albumsToEnqueue = await db.query.albums.findMany({
				where: (a, { isNull }) => isNull(a.mbid),
				columns: { id: true, title: true, mbid: true },
				limit,
			})
		} else {
			// Find albums with MBIDs
			albumsToEnqueue = await db.query.albums.findMany({
				where: (a, { isNotNull }) => isNotNull(a.mbid),
				columns: { id: true, title: true, mbid: true },
				limit,
			})
		}

		const jobType: MbEnrichmentJobType =
			typeParam === 'resolve' ? 'album.resolve_mbid' : 'album.sync'

		const results = await enqueueJobs(
			albumsToEnqueue.map((album) => ({
				jobType,
				entityType: 'album' as MbEnrichmentEntityType,
				entityId: album.id,
				priority: 5, // Medium priority for bulk requests
			}))
		)

		const created = results.filter((r) => r.created).length
		const skipped = results.filter((r) => !r.created).length

		return ctx.json(
			{
				message: `Enqueued ${created} jobs, ${skipped} already existed`,
				total: albumsToEnqueue.length,
				created,
				skipped,
				jobType,
				jobIds: results.filter((r) => r.created).map((r) => r.jobId),
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error in bulk album enqueue:', error)
		return ctx.json({ error: 'Bulk enqueue failed' }, 500)
	}
})

// =============================================================================
// Track Sync (Enqueue)
// =============================================================================

/**
 * POST /api/sync/tracks/:id
 *
 * Enqueue a sync job for a single track.
 * The track must have an MBID for sync, otherwise resolve_mbid is enqueued.
 * Returns 202 Accepted with job info.
 */
sync.post('/tracks/:id', async (ctx) => {
	const trackId = ctx.req.param('id')

	const track = await db.query.tracks.findFirst({
		where: (t, { eq }) => eq(t.id, trackId),
	})

	if (!track) {
		return ctx.json({ error: 'Track not found' }, 404)
	}

	try {
		// Choose job type based on whether track has MBID
		const jobType: MbEnrichmentJobType = track.mbid ? 'track.sync' : 'track.resolve_mbid'

		const result = await enqueueJob({
			jobType,
			entityType: 'track',
			entityId: trackId,
			priority: 10, // Higher priority for manual requests
		})

		return ctx.json(
			{
				message: result.created ? 'Job enqueued' : 'Job already exists',
				jobId: result.jobId,
				jobType,
				entityId: trackId,
				entityName: track.title,
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error enqueueing track sync:', error)
		return ctx.json({ error: 'Failed to enqueue job' }, 500)
	}
})

/**
 * POST /api/sync/tracks
 *
 * Enqueue sync jobs for multiple tracks.
 * Query params:
 * - limit: Max tracks to enqueue (default 10, max 50)
 * - type: 'sync' (default, for tracks with MBID) or 'resolve' (for tracks without MBID)
 */
sync.post('/tracks', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const typeParam = ctx.req.query('type') || 'sync'
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		let tracksToEnqueue: Array<{ id: string; title: string; mbid: string | null }>

		if (typeParam === 'resolve') {
			// Find tracks without MBIDs
			tracksToEnqueue = await db.query.tracks.findMany({
				where: (t, { isNull }) => isNull(t.mbid),
				columns: { id: true, title: true, mbid: true },
				limit,
			})
		} else {
			// Find tracks with MBIDs
			tracksToEnqueue = await db.query.tracks.findMany({
				where: (t, { isNotNull }) => isNotNull(t.mbid),
				columns: { id: true, title: true, mbid: true },
				limit,
			})
		}

		const jobType: MbEnrichmentJobType =
			typeParam === 'resolve' ? 'track.resolve_mbid' : 'track.sync'

		const results = await enqueueJobs(
			tracksToEnqueue.map((track) => ({
				jobType,
				entityType: 'track' as MbEnrichmentEntityType,
				entityId: track.id,
				priority: 5, // Medium priority for bulk requests
			}))
		)

		const created = results.filter((r) => r.created).length
		const skipped = results.filter((r) => !r.created).length

		return ctx.json(
			{
				message: `Enqueued ${created} jobs, ${skipped} already existed`,
				total: tracksToEnqueue.length,
				created,
				skipped,
				jobType,
				jobIds: results.filter((r) => r.created).map((r) => r.jobId),
			},
			202
		)
	} catch (error) {
		console.error('[Sync] Error in bulk track enqueue:', error)
		return ctx.json({ error: 'Bulk enqueue failed' }, 500)
	}
})

// =============================================================================
// Entity Job History
// =============================================================================

/**
 * GET /api/sync/artists/:id/jobs
 *
 * Get recent jobs for an artist.
 */
sync.get('/artists/:id/jobs', async (ctx) => {
	const artistId = ctx.req.param('id')
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		const jobs = await getJobsForEntity('artist', artistId, limit)
		return ctx.json({ entityType: 'artist', entityId: artistId, jobs })
	} catch (error) {
		console.error('[Sync] Error getting artist jobs:', error)
		return ctx.json({ error: 'Failed to get jobs' }, 500)
	}
})

/**
 * GET /api/sync/albums/:id/jobs
 *
 * Get recent jobs for an album.
 */
sync.get('/albums/:id/jobs', async (ctx) => {
	const albumId = ctx.req.param('id')
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		const jobs = await getJobsForEntity('album', albumId, limit)
		return ctx.json({ entityType: 'album', entityId: albumId, jobs })
	} catch (error) {
		console.error('[Sync] Error getting album jobs:', error)
		return ctx.json({ error: 'Failed to get jobs' }, 500)
	}
})

/**
 * GET /api/sync/tracks/:id/jobs
 *
 * Get recent jobs for a track.
 */
sync.get('/tracks/:id/jobs', async (ctx) => {
	const trackId = ctx.req.param('id')
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		const jobs = await getJobsForEntity('track', trackId, limit)
		return ctx.json({ entityType: 'track', entityId: trackId, jobs })
	} catch (error) {
		console.error('[Sync] Error getting track jobs:', error)
		return ctx.json({ error: 'Failed to get jobs' }, 500)
	}
})

export default sync
