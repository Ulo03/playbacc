/**
 * Stats Routes
 *
 * Provides endpoints for user statistics like top artists.
 * All endpoints require authentication.
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { db } from '../db'
import { sql } from 'drizzle-orm'
import type { AppVariables } from '../types'

const stats = new Hono<{ Variables: AppVariables }>()

// Apply authentication to all routes
stats.use('*', authenticate)

/**
 * GET /api/stats/top-groups
 *
 * Returns the user's top 5 groups (bands) based on scrobble count.
 */
stats.get('/top-groups', async (ctx) => {
	const user = ctx.get('user')
	const userId = user.id

	try {
		const topGroups = await db.execute<{
			id: string
			name: string
			image_url: string | null
			play_count: string
			total_ms: string
		}>(sql`
			SELECT 
				a.id,
				a.name,
				a.image_url,
				COUNT(s.id) as play_count,
				COALESCE(SUM(s.played_duration_ms), 0) as total_ms
			FROM scrobbles s
			JOIN track_artists ta ON ta.track_id = s.track_id AND ta.is_primary = true
			JOIN artists a ON a.id = ta.artist_id
			WHERE s.user_id = ${userId}
				AND a.type = 'group'
			GROUP BY a.id, a.name, a.image_url
			ORDER BY play_count DESC
			LIMIT 5
		`)

		return ctx.json({
			items: topGroups.map((row) => ({
				id: row.id,
				name: row.name,
				image_url: row.image_url,
				play_count: parseInt(row.play_count, 10),
				total_ms: parseInt(row.total_ms, 10),
			})),
		})
	} catch (error) {
		console.error('[Stats] Error fetching top groups:', error)
		return ctx.json({ error: 'Failed to fetch top groups' }, 500)
	}
})

/**
 * GET /api/stats/top-solo-artists
 *
 * Returns the user's top 5 solo artists (not part of any group) based on scrobble count.
 */
stats.get('/top-solo-artists', async (ctx) => {
	const user = ctx.get('user')
	const userId = user.id

	try {
		const topSoloArtists = await db.execute<{
			id: string
			name: string
			image_url: string | null
			play_count: string
			total_ms: string
		}>(sql`
			SELECT 
				a.id,
				a.name,
				a.image_url,
				COUNT(s.id) as play_count,
				COALESCE(SUM(s.played_duration_ms), 0) as total_ms
			FROM scrobbles s
			JOIN track_artists ta ON ta.track_id = s.track_id AND ta.is_primary = true
			JOIN artists a ON a.id = ta.artist_id
			WHERE s.user_id = ${userId}
				AND a.type = 'person'
				AND NOT EXISTS (
					SELECT 1 FROM artists_groups ag WHERE ag.member_id = a.id
				)
			GROUP BY a.id, a.name, a.image_url
			ORDER BY play_count DESC
			LIMIT 5
		`)

		return ctx.json({
			items: topSoloArtists.map((row) => ({
				id: row.id,
				name: row.name,
				image_url: row.image_url,
				play_count: parseInt(row.play_count, 10),
				total_ms: parseInt(row.total_ms, 10),
			})),
		})
	} catch (error) {
		console.error('[Stats] Error fetching top solo artists:', error)
		return ctx.json({ error: 'Failed to fetch top solo artists' }, 500)
	}
})

export default stats
