/**
 * Artists Routes
 *
 * Provides endpoints for artist details including members and group affiliations.
 * All endpoints require authentication.
 */

import { Hono } from 'hono'
import { authenticate } from '../middleware/auth'
import { db } from '../db'
import { sql } from 'drizzle-orm'
import type { AppVariables } from '../types'

const artists = new Hono<{ Variables: AppVariables }>()

// Apply authentication to all routes
artists.use('*', authenticate)

interface MemberInfo {
	id: string
	name: string
	image_url: string | null
	begin_raw: string | null
	end_raw: string | null
	ended: boolean
}

interface GroupInfo {
	id: string
	name: string
	image_url: string | null
	begin_raw: string | null
	end_raw: string | null
	ended: boolean
}

/**
 * GET /api/artists/:id
 *
 * Returns artist details including:
 * - For groups: list of current and previous members
 * - For persons: list of groups they belong to
 */
artists.get('/:id', async (ctx) => {
	const artistId = ctx.req.param('id')

	// Validate UUID format
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	if (!uuidRegex.test(artistId)) {
		return ctx.json({ error: 'Invalid artist ID format' }, 400)
	}

	try {
		// Fetch artist basic info
		const artistResult = await db.execute<{
			id: string
			name: string
			image_url: string | null
			type: string | null
			gender: string | null
			begin_date: string | null
			end_date: string | null
			mbid: string | null
		}>(sql`
			SELECT id, name, image_url, type, gender, begin_date, end_date, mbid
			FROM artists
			WHERE id = ${artistId}
		`)

		if (artistResult.length === 0) {
			return ctx.json({ error: 'Artist not found' }, 404)
		}

		const artist = artistResult[0]

		// For groups, fetch members
		if (artist.type === 'group') {
			const membersResult = await db.execute<{
				id: string
				name: string
				image_url: string | null
				begin_raw: string | null
				end_raw: string | null
				ended: boolean
			}>(sql`
				SELECT
					a.id,
					a.name,
					a.image_url,
					ag.begin_raw,
					ag.end_raw,
					ag.ended
				FROM artists_groups ag
				JOIN artists a ON a.id = ag.member_id
				WHERE ag.group_id = ${artistId}
				ORDER BY ag.ended ASC, ag.begin_raw ASC NULLS LAST, a.name ASC
			`)

			const currentMembers: MemberInfo[] = []
			const previousMembers: MemberInfo[] = []

			for (const member of membersResult) {
				const memberInfo: MemberInfo = {
					id: member.id,
					name: member.name,
					image_url: member.image_url,
					begin_raw: member.begin_raw,
					end_raw: member.end_raw,
					ended: member.ended,
				}

				if (member.ended) {
					previousMembers.push(memberInfo)
				} else {
					currentMembers.push(memberInfo)
				}
			}

			return ctx.json({
				id: artist.id,
				name: artist.name,
				image_url: artist.image_url,
				type: artist.type,
				gender: artist.gender,
				begin_date: artist.begin_date,
				end_date: artist.end_date,
				mbid: artist.mbid,
				members: {
					current: currentMembers,
					previous: previousMembers,
				},
			})
		}

		// For persons (and other types), fetch groups they belong to
		const groupsResult = await db.execute<{
			id: string
			name: string
			image_url: string | null
			begin_raw: string | null
			end_raw: string | null
			ended: boolean
		}>(sql`
			SELECT
				a.id,
				a.name,
				a.image_url,
				ag.begin_raw,
				ag.end_raw,
				ag.ended
			FROM artists_groups ag
			JOIN artists a ON a.id = ag.group_id
			WHERE ag.member_id = ${artistId}
			ORDER BY ag.ended ASC, ag.begin_raw ASC NULLS LAST, a.name ASC
		`)

		const groups: GroupInfo[] = groupsResult.map((group) => ({
			id: group.id,
			name: group.name,
			image_url: group.image_url,
			begin_raw: group.begin_raw,
			end_raw: group.end_raw,
			ended: group.ended,
		}))

		return ctx.json({
			id: artist.id,
			name: artist.name,
			image_url: artist.image_url,
			type: artist.type,
			gender: artist.gender,
			begin_date: artist.begin_date,
			end_date: artist.end_date,
			mbid: artist.mbid,
			groups,
		})
	} catch (error) {
		console.error('[Artists] Error fetching artist:', error)
		return ctx.json({ error: 'Failed to fetch artist' }, 500)
	}
})

export default artists
