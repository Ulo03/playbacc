/**
 * Player Routes
 *
 * Provides endpoints for player state from connected accounts.
 * All endpoints require authentication.
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { getCurrentlyPlaying } from '../lib/spotify'
import { db } from '../db'
import { desc, eq, inArray } from 'drizzle-orm'
import {
	scrobbles,
	tracks,
	albums,
	track_artists,
	artists,
} from '@playbacc/types/db/schema'
import type { AppVariables } from '../types'

const player = new Hono<{ Variables: AppVariables }>()

// Apply authentication to all routes
player.use('*', authenticate)

/**
 * GET /api/player/currently-playing
 *
 * Returns the currently playing track from the user's Spotify account.
 * Returns null if nothing is playing.
 */
player.get('/currently-playing', async (ctx) => {
	const account = ctx.get('account')

	if (!account.access_token) {
		return ctx.json({ error: 'No Spotify access token available' }, 401)
	}

	try {
		const currentlyPlaying = await getCurrentlyPlaying(account.access_token)

		if (!currentlyPlaying || !currentlyPlaying.item) {
			return ctx.json({ playing: false })
		}

		const item = currentlyPlaying.item
		return ctx.json({
			playing: true,
			is_playing: currentlyPlaying.is_playing,
			progress_ms: currentlyPlaying.progress_ms,
			track: {
				id: item.id,
				name: item.name,
				duration_ms: item.duration_ms,
				explicit: item.explicit,
				album: {
					id: item.album.id,
					name: item.album.name,
					images: item.album.images,
				},
				artists: item.artists.map((artist) => ({
					id: artist.id,
					name: artist.name,
				})),
			},
		})
	} catch (error) {
		console.error('[Player] Error fetching currently playing:', error)
		return ctx.json({ error: 'Failed to fetch currently playing' }, 500)
	}
})

/**
 * GET /api/player/recently-played
 *
 * Returns the user's recently played tracks from the scrobbles database.
 * Query params:
 *   - limit: number of tracks to return (default 10, max 50)
 */
player.get('/recently-played', async (ctx) => {
	const account = ctx.get('account')
	const limit = Math.min(parseInt(ctx.req.query('limit') || '10', 10), 50)

	try {
		// Fetch recent scrobbles from database with track, album, and artist info
		const recentScrobbles = await db
			.select({
				scrobble_id: scrobbles.id,
				played_at: scrobbles.played_at,
				skipped: scrobbles.skipped,
				track_id: tracks.id,
				track_title: tracks.title,
				track_duration_ms: tracks.duration_ms,
				track_explicit: tracks.explicit,
				album_id: albums.id,
				album_title: albums.title,
				album_image_url: albums.image_url,
			})
			.from(scrobbles)
			.innerJoin(tracks, eq(scrobbles.track_id, tracks.id))
			.leftJoin(albums, eq(scrobbles.album_id, albums.id))
			.where(eq(scrobbles.user_id, account.user_id))
			.orderBy(desc(scrobbles.played_at))
			.limit(limit)

		// Fetch artists for each track
		const trackIds = [...new Set(recentScrobbles.map((s) => s.track_id))]
		const trackArtistsData =
			trackIds.length > 0
				? await db
						.select({
							track_id: track_artists.track_id,
							artist_id: artists.id,
							artist_name: artists.name,
							is_primary: track_artists.is_primary,
							order: track_artists.order,
						})
						.from(track_artists)
						.innerJoin(
							artists,
							eq(track_artists.artist_id, artists.id)
						)
						.where(inArray(track_artists.track_id, trackIds))
						.orderBy(track_artists.order)
				: []

		// Group artists by track
		const artistsByTrack = new Map<
			string,
			Array<{ id: string; name: string }>
		>()
		for (const ta of trackArtistsData) {
			if (!artistsByTrack.has(ta.track_id)) {
				artistsByTrack.set(ta.track_id, [])
			}
			artistsByTrack.get(ta.track_id)!.push({
				id: ta.artist_id,
				name: ta.artist_name,
			})
		}

		const items = recentScrobbles.map((scrobble) => ({
			played_at:
				scrobble.played_at?.toISOString() ?? new Date().toISOString(),
			skipped: scrobble.skipped,
			track: {
				id: scrobble.track_id,
				name: scrobble.track_title,
				duration_ms: scrobble.track_duration_ms ?? 0,
				explicit: scrobble.track_explicit,
				album: scrobble.album_id
					? {
							id: scrobble.album_id,
							name: scrobble.album_title ?? '',
							images: scrobble.album_image_url
								? [{ url: scrobble.album_image_url }]
								: [],
						}
					: {
							id: '',
							name: '',
							images: [],
						},
				artists: artistsByTrack.get(scrobble.track_id) ?? [],
			},
		}))

		return ctx.json({ items })
	} catch (error) {
		console.error('[Player] Error fetching recently played:', error)
		return ctx.json({ error: 'Failed to fetch recently played' }, 500)
	}
})

export default player
