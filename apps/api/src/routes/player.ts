/**
 * Player Routes
 *
 * Provides endpoints for player state from connected accounts.
 * All endpoints require authentication.
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { getCurrentlyPlaying } from '../lib/spotify'
import type { SpotifyAccount } from '../lib/spotify'

const player = new Hono()

// Apply authentication to all routes
player.use('*', authenticate)

/**
 * GET /api/player/currently-playing
 *
 * Returns the currently playing track from the user's Spotify account.
 * Returns null if nothing is playing.
 */
player.get('/currently-playing', async (ctx) => {
	const account = ctx.get('account') as SpotifyAccount

	if (!account.access_token) {
		return ctx.json({ error: 'No Spotify access token available' }, 401)
	}

	try {
		const currentlyPlaying = await getCurrentlyPlaying(account.access_token)

		if (!currentlyPlaying) {
			return ctx.json({ playing: false })
		}

		return ctx.json({
			playing: true,
			is_playing: currentlyPlaying.is_playing,
			progress_ms: currentlyPlaying.progress_ms,
			track: {
				id: currentlyPlaying.item.id,
				name: currentlyPlaying.item.name,
				duration_ms: currentlyPlaying.item.duration_ms,
				explicit: currentlyPlaying.item.explicit,
				album: {
					id: currentlyPlaying.item.album.id,
					name: currentlyPlaying.item.album.name,
					images: currentlyPlaying.item.album.images,
				},
				artists: currentlyPlaying.item.artists.map((artist) => ({
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

export default player
