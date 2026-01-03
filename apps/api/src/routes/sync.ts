/**
 * MusicBrainz Sync Routes
 *
 * Provides endpoints for:
 * - Searching MusicBrainz for candidates (artists, releases)
 * - Syncing single entities by ID
 * - Bulk syncing entities
 *
 * All endpoints require authentication.
 *
 * @module routes/sync
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { searchArtists, searchReleases } from '../lib/musicbrainz'
import {
	syncArtistRelationshipsByMbid,
	syncTrackById,
	syncAlbumById,
} from '../lib/sync'
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
							secondaryTypes:
								r['release-group']['secondary-types'],
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
// Artist Sync
// =============================================================================

/**
 * POST /api/sync/artists/:id
 *
 * Sync a single artist's relationships from MusicBrainz.
 * The artist must have an MBID.
 */
sync.post('/artists/:id', async (ctx) => {
	const artistId = ctx.req.param('id')

	const artist = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.id, artistId),
	})

	if (!artist) {
		return ctx.json({ error: 'Artist not found' }, 404)
	}

	if (!artist.mbid) {
		return ctx.json({ error: 'Artist has no MBID' }, 400)
	}

	try {
		const result = await syncArtistRelationshipsByMbid(artist.mbid)

		return ctx.json({
			artistId,
			mbid: artist.mbid,
			artistType: result.artistType,
			membershipsProcessed: result.membershipsProcessed,
			membershipsInserted: result.membershipsInserted,
			membershipsUpdated: result.membershipsUpdated,
			membersProcessed: result.membersProcessed,
			errors: result.errors,
		})
	} catch (error) {
		console.error('[Sync] Error syncing artist:', error)
		return ctx.json({ error: 'Sync failed' }, 500)
	}
})

/**
 * POST /api/sync/artists
 *
 * Bulk sync artists that have MBIDs.
 * Query params:
 * - limit: Max artists to sync (default 10, max 50)
 */
sync.post('/artists', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		// Find artists with MBIDs that we can sync
		const artistsToSync = await db.query.artists.findMany({
			where: (a, { isNotNull }) => isNotNull(a.mbid),
			columns: { id: true, name: true, mbid: true },
			limit,
		})

		const results = {
			total: artistsToSync.length,
			synced: 0,
			failed: 0,
			details: [] as Array<{
				artistId: string
				name: string
				mbid: string
				success: boolean
				membershipsInserted?: number
				error?: string
			}>,
		}

		for (const artist of artistsToSync) {
			if (!artist.mbid) continue

			try {
				const syncResult = await syncArtistRelationshipsByMbid(
					artist.mbid
				)

				if (syncResult.errors.length === 0) {
					results.synced++
					results.details.push({
						artistId: artist.id,
						name: artist.name,
						mbid: artist.mbid,
						success: true,
						membershipsInserted: syncResult.membershipsInserted,
					})
				} else {
					results.failed++
					results.details.push({
						artistId: artist.id,
						name: artist.name,
						mbid: artist.mbid,
						success: false,
						error: syncResult.errors.join(', '),
					})
				}
			} catch (error) {
				results.failed++
				const message =
					error instanceof Error ? error.message : String(error)
				results.details.push({
					artistId: artist.id,
					name: artist.name,
					mbid: artist.mbid,
					success: false,
					error: message,
				})
			}
		}

		return ctx.json(results)
	} catch (error) {
		console.error('[Sync] Error in bulk artist sync:', error)
		return ctx.json({ error: 'Bulk sync failed' }, 500)
	}
})

// =============================================================================
// Album Sync
// =============================================================================

/**
 * POST /api/sync/albums/:id
 *
 * Sync a single album's metadata from MusicBrainz.
 * The album must have an MBID.
 */
sync.post('/albums/:id', async (ctx) => {
	const albumId = ctx.req.param('id')

	const album = await db.query.albums.findFirst({
		where: (a, { eq }) => eq(a.id, albumId),
	})

	if (!album) {
		return ctx.json({ error: 'Album not found' }, 404)
	}

	if (!album.mbid) {
		return ctx.json({ error: 'Album has no MBID' }, 400)
	}

	try {
		const result = await syncAlbumById(albumId)

		return ctx.json({
			albumId,
			mbid: album.mbid,
			found: result.found,
			updated: result.updated,
			coverArtFetched: result.coverArtFetched,
			errors: result.errors,
		})
	} catch (error) {
		console.error('[Sync] Error syncing album:', error)
		return ctx.json({ error: 'Sync failed' }, 500)
	}
})

/**
 * POST /api/sync/albums
 *
 * Bulk sync albums that have MBIDs.
 * Query params:
 * - limit: Max albums to sync (default 10, max 50)
 */
sync.post('/albums', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		// Find albums with MBIDs
		const albumsToSync = await db.query.albums.findMany({
			where: (a, { isNotNull }) => isNotNull(a.mbid),
			columns: { id: true, title: true, mbid: true },
			limit,
		})

		const results = {
			total: albumsToSync.length,
			synced: 0,
			failed: 0,
			coversFetched: 0,
			details: [] as Array<{
				albumId: string
				title: string
				mbid: string
				success: boolean
				coverArtFetched?: boolean
				error?: string
			}>,
		}

		for (const album of albumsToSync) {
			if (!album.mbid) continue

			try {
				const syncResult = await syncAlbumById(album.id)

				if (syncResult.errors.length === 0) {
					results.synced++
					if (syncResult.coverArtFetched) results.coversFetched++
					results.details.push({
						albumId: album.id,
						title: album.title,
						mbid: album.mbid,
						success: true,
						coverArtFetched: syncResult.coverArtFetched,
					})
				} else {
					results.failed++
					results.details.push({
						albumId: album.id,
						title: album.title,
						mbid: album.mbid,
						success: false,
						error: syncResult.errors.join(', '),
					})
				}
			} catch (error) {
				results.failed++
				const message =
					error instanceof Error ? error.message : String(error)
				results.details.push({
					albumId: album.id,
					title: album.title,
					mbid: album.mbid,
					success: false,
					error: message,
				})
			}
		}

		return ctx.json(results)
	} catch (error) {
		console.error('[Sync] Error in bulk album sync:', error)
		return ctx.json({ error: 'Bulk sync failed' }, 500)
	}
})

// =============================================================================
// Track Sync
// =============================================================================

/**
 * POST /api/sync/tracks/:id
 *
 * Sync a single track's metadata from MusicBrainz.
 * The track must have an MBID.
 */
sync.post('/tracks/:id', async (ctx) => {
	const trackId = ctx.req.param('id')

	const track = await db.query.tracks.findFirst({
		where: (t, { eq }) => eq(t.id, trackId),
	})

	if (!track) {
		return ctx.json({ error: 'Track not found' }, 404)
	}

	if (!track.mbid) {
		return ctx.json({ error: 'Track has no MBID' }, 400)
	}

	try {
		const result = await syncTrackById(trackId)

		return ctx.json({
			trackId,
			mbid: track.mbid,
			found: result.found,
			updated: result.updated,
			errors: result.errors,
		})
	} catch (error) {
		console.error('[Sync] Error syncing track:', error)
		return ctx.json({ error: 'Sync failed' }, 500)
	}
})

/**
 * POST /api/sync/tracks
 *
 * Bulk sync tracks that have MBIDs.
 * Query params:
 * - limit: Max tracks to sync (default 10, max 50)
 */
sync.post('/tracks', async (ctx) => {
	const limitParam = ctx.req.query('limit')
	const limit = Math.min(parseInt(limitParam || '10', 10), 50)

	try {
		// Find tracks with MBIDs
		const tracksToSync = await db.query.tracks.findMany({
			where: (t, { isNotNull }) => isNotNull(t.mbid),
			columns: { id: true, title: true, mbid: true },
			limit,
		})

		const results = {
			total: tracksToSync.length,
			synced: 0,
			failed: 0,
			details: [] as Array<{
				trackId: string
				title: string
				mbid: string
				success: boolean
				error?: string
			}>,
		}

		for (const track of tracksToSync) {
			if (!track.mbid) continue

			try {
				const syncResult = await syncTrackById(track.id)

				if (syncResult.errors.length === 0) {
					results.synced++
					results.details.push({
						trackId: track.id,
						title: track.title,
						mbid: track.mbid,
						success: true,
					})
				} else {
					results.failed++
					results.details.push({
						trackId: track.id,
						title: track.title,
						mbid: track.mbid,
						success: false,
						error: syncResult.errors.join(', '),
					})
				}
			} catch (error) {
				results.failed++
				const message =
					error instanceof Error ? error.message : String(error)
				results.details.push({
					trackId: track.id,
					title: track.title,
					mbid: track.mbid,
					success: false,
					error: message,
				})
			}
		}

		return ctx.json(results)
	} catch (error) {
		console.error('[Sync] Error in bulk track sync:', error)
		return ctx.json({ error: 'Bulk sync failed' }, 500)
	}
})

export default sync
