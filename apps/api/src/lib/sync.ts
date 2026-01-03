/**
 * MusicBrainz Sync Service
 *
 * Provides functionality for:
 * - Syncing artist relationships (group memberships)
 * - Syncing track/album metadata from MusicBrainz
 * - Date parsing and precision-aware refinement
 *
 * @module sync
 */

import { db } from '../db'
import { eq } from 'drizzle-orm'
import {
	artists,
	artists_groups,
	albums,
	tracks,
} from '@playbacc/types/db/schema'
import {
	getArtistDetails,
	extractGroupMemberships,
	extractGroupMembers,
	getRecordingDetails,
	getReleaseDetails,
	getReleaseCoverUrl,
	type GroupMembership,
	type GroupMember,
} from './musicbrainz'
import type { MusicBrainzArtistDetails } from '@playbacc/types/api/musicbrainz'

// =============================================================================
// Date Parsing Helpers
// =============================================================================

/**
 * Represents precision levels for MusicBrainz dates.
 * MusicBrainz dates can be:
 * - Year only: "2020" (precision 0)
 * - Year-month: "2020-05" (precision 1)
 * - Full date: "2020-05-15" (precision 2)
 */
export type DatePrecision = 0 | 1 | 2

/**
 * Determines the precision rank of a raw MusicBrainz date string.
 *
 * @param rawDate - Raw date string (YYYY, YYYY-MM, or YYYY-MM-DD)
 * @returns Precision rank (0=year, 1=month, 2=day)
 */
export function getDatePrecision(
	rawDate: string | null | undefined
): DatePrecision {
	if (!rawDate) return 0
	const parts = rawDate.split('-')
	if (parts.length >= 3) return 2 // Full date
	if (parts.length === 2) return 1 // Year-month
	return 0 // Year only
}

/**
 * Parses a raw MusicBrainz date string into a normalized Date object.
 * Missing components default to the start of the period:
 * - "2020" → 2020-01-01
 * - "2020-05" → 2020-05-01
 * - "2020-05-15" → 2020-05-15
 *
 * @param rawDate - Raw date string from MusicBrainz
 * @returns Normalized Date object or null if unparseable
 */
export function parseRawDate(rawDate: string | null | undefined): Date | null {
	if (!rawDate) return null

	const parts = rawDate.split('-').map(Number)
	if (parts.length === 0 || isNaN(parts[0])) return null

	const year = parts[0]
	const month = parts.length > 1 && !isNaN(parts[1]) ? parts[1] - 1 : 0 // JS months are 0-indexed
	const day = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 1

	return new Date(year, month, day)
}

/**
 * Formats a Date object to a SQL-compatible date string (YYYY-MM-DD).
 *
 * @param date - Date object
 * @returns Formatted date string
 */
export function formatDateForDb(date: Date): string {
	return date.toISOString().split('T')[0]
}

/**
 * Checks if two raw date strings are compatible for refinement.
 * A new date can refine an existing date if:
 * - They represent the same time period at different precisions
 * - e.g., "2020" is compatible with "2020-05" and "2020-05-15"
 *
 * @param existing - Existing raw date (may be less precise)
 * @param incoming - New raw date (may be more precise)
 * @returns True if incoming refines or matches existing
 */
export function areDatesCompatible(
	existing: string | null | undefined,
	incoming: string | null | undefined
): boolean {
	// If either is null/undefined, they're compatible (null can be refined)
	if (!existing || !incoming) return true

	// Get the shorter length (less precise date)
	const minLength = Math.min(existing.length, incoming.length)

	// Check if the more precise date starts with the less precise one
	return existing.substring(0, minLength) === incoming.substring(0, minLength)
}

/**
 * Determines if a new date should replace an existing date.
 * Replacement happens if:
 * - The new date is more precise (longer string)
 * - AND the dates are compatible (represent same period)
 *
 * @param existing - Existing raw date
 * @param incoming - New raw date
 * @returns True if incoming should replace existing
 */
export function shouldRefineDate(
	existing: string | null | undefined,
	incoming: string | null | undefined
): boolean {
	// Can't refine with null/undefined
	if (!incoming) return false

	// Always accept if existing is null
	if (!existing) return true

	// Check compatibility first
	if (!areDatesCompatible(existing, incoming)) return false

	// Incoming must be more precise (longer)
	return incoming.length > existing.length
}

// =============================================================================
// Membership Period Management
// =============================================================================

/**
 * Result of an upsert membership operation
 */
export interface UpsertMembershipResult {
	/** Whether a new record was inserted */
	inserted: boolean
	/** Whether an existing record was updated (refined) */
	updated: boolean
	/** The membership period ID */
	id: string
}

/**
 * Upserts a membership period with date refinement logic.
 *
 * Matching strategy:
 * 1. Try exact match on (member_id, group_id, begin_raw, end_raw)
 * 2. If no exact match, look for compatible periods that can be refined
 * 3. Update if new data is more precise; insert if no match found
 *
 * @param memberId - Artist ID of the member
 * @param groupId - Artist ID of the group
 * @param membership - Membership data from MusicBrainz
 * @returns Result of the upsert operation
 */
export async function upsertMembershipPeriod(
	memberId: string,
	groupId: string,
	membership: Pick<
		GroupMembership | GroupMember,
		'beginDate' | 'endDate' | 'ended'
	>
): Promise<UpsertMembershipResult> {
	const beginRaw = membership.beginDate ?? null
	const endRaw = membership.endDate ?? null
	const beginDate = parseRawDate(beginRaw)
	const endDate = parseRawDate(endRaw)

	// Try to find existing periods for this member+group
	const existingPeriods = await db.query.artists_groups.findMany({
		where: (ag, { eq, and }) =>
			and(eq(ag.member_id, memberId), eq(ag.group_id, groupId)),
	})

	// 1. Check for exact match
	const exactMatch = existingPeriods.find(
		(p) => p.begin_raw === beginRaw && p.end_raw === endRaw
	)
	if (exactMatch) {
		// Already exists with same precision - update ended flag if needed
		if (exactMatch.ended !== membership.ended) {
			await db
				.update(artists_groups)
				.set({ ended: membership.ended })
				.where(eq(artists_groups.id, exactMatch.id))
			return { inserted: false, updated: true, id: exactMatch.id }
		}
		return { inserted: false, updated: false, id: exactMatch.id }
	}

	// 2. Look for compatible period that can be refined
	for (const existing of existingPeriods) {
		const beginCompatible = areDatesCompatible(existing.begin_raw, beginRaw)
		const endCompatible = areDatesCompatible(existing.end_raw, endRaw)

		if (beginCompatible && endCompatible) {
			// Check if we should refine either date
			const shouldRefineBegin = shouldRefineDate(
				existing.begin_raw,
				beginRaw
			)
			const shouldRefineEnd = shouldRefineDate(existing.end_raw, endRaw)

			if (
				shouldRefineBegin ||
				shouldRefineEnd ||
				existing.ended !== membership.ended
			) {
				// Update with more precise data
				await db
					.update(artists_groups)
					.set({
						begin_date:
							shouldRefineBegin && beginDate
								? formatDateForDb(beginDate)
								: undefined,
						end_date:
							shouldRefineEnd && endDate
								? formatDateForDb(endDate)
								: undefined,
						begin_raw: shouldRefineBegin ? beginRaw : undefined,
						end_raw: shouldRefineEnd ? endRaw : undefined,
						ended: membership.ended,
					})
					.where(eq(artists_groups.id, existing.id))

				return { inserted: false, updated: true, id: existing.id }
			}

			// Compatible but not more precise - no update needed
			return { inserted: false, updated: false, id: existing.id }
		}
	}

	// 3. No match found - insert new period
	const [newPeriod] = await db
		.insert(artists_groups)
		.values({
			member_id: memberId,
			group_id: groupId,
			begin_date: beginDate ? formatDateForDb(beginDate) : null,
			end_date: endDate ? formatDateForDb(endDate) : null,
			begin_raw: beginRaw,
			end_raw: endRaw,
			ended: membership.ended,
		})
		.returning()

	return { inserted: true, updated: false, id: newPeriod.id }
}

// =============================================================================
// Artist Sync
// =============================================================================

/**
 * Result of syncing artist relationships
 */
export interface SyncArtistRelationshipsResult {
	/** Artist type (Person, Group, etc.) */
	artistType: string | null
	/** Number of membership periods processed */
	membershipsProcessed: number
	/** Number of new periods inserted */
	membershipsInserted: number
	/** Number of periods updated (refined) */
	membershipsUpdated: number
	/** Number of members processed (for groups) */
	membersProcessed: number
	/** Errors encountered */
	errors: string[]
}

/**
 * Ensures an artist exists in the database, creating if needed.
 *
 * @param mbid - MusicBrainz artist ID
 * @param name - Artist name
 * @returns Artist database ID
 */
async function ensureArtistByMbid(mbid: string, name: string): Promise<string> {
	// Try to find by MBID
	const existing = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.mbid, mbid),
	})
	if (existing) {
		return existing.id
	}

	// Try to find by name (case-insensitive would be better, but keeping simple)
	const existingByName = await db.query.artists.findFirst({
		where: (a, { eq }) => eq(a.name, name),
	})
	if (existingByName) {
		// Update with MBID
		await db
			.update(artists)
			.set({ mbid })
			.where(eq(artists.id, existingByName.id))
		return existingByName.id
	}

	// Create new artist
	const [newArtist] = await db
		.insert(artists)
		.values({ name, mbid })
		.returning()

	return newArtist.id
}

/**
 * Syncs an artist's relationships from MusicBrainz.
 * - For Person artists: syncs their group memberships
 * - For Group artists: syncs their members (one hop only, no recursive sync)
 *
 * @param artistMbid - MusicBrainz artist ID
 * @returns Sync result statistics
 */
export async function syncArtistRelationshipsByMbid(
	artistMbid: string
): Promise<SyncArtistRelationshipsResult> {
	const result: SyncArtistRelationshipsResult = {
		artistType: null,
		membershipsProcessed: 0,
		membershipsInserted: 0,
		membershipsUpdated: 0,
		membersProcessed: 0,
		errors: [],
	}

	try {
		// Fetch artist details from MusicBrainz
		const mbArtist = await getArtistDetails(artistMbid)
		if (!mbArtist) {
			result.errors.push(`Artist not found in MusicBrainz: ${artistMbid}`)
			return result
		}

		result.artistType = mbArtist.type ?? null

		// Ensure the artist exists in our database
		const artistId = await ensureArtistByMbid(artistMbid, mbArtist.name)

		// Handle based on artist type
		if (mbArtist.type === 'Group') {
			// For groups: sync their members
			const members = extractGroupMembers(mbArtist)
			result.membersProcessed = members.length

			for (const member of members) {
				try {
					// Ensure member artist exists
					const memberId = await ensureArtistByMbid(
						member.memberMbid,
						member.memberName
					)

					// Upsert the membership period
					const upsertResult = await upsertMembershipPeriod(
						memberId,
						artistId,
						{
							beginDate: member.beginDate,
							endDate: member.endDate,
							ended: member.ended,
						}
					)

					result.membershipsProcessed++
					if (upsertResult.inserted) result.membershipsInserted++
					if (upsertResult.updated) result.membershipsUpdated++
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error)
					result.errors.push(
						`Error processing member ${member.memberName}: ${message}`
					)
				}
			}
		} else {
			// For non-groups (Person, etc.): sync their group memberships
			const memberships = extractGroupMemberships(mbArtist)
			result.membershipsProcessed = memberships.length

			for (const membership of memberships) {
				try {
					// Ensure group artist exists
					const groupId = await ensureArtistByMbid(
						membership.groupMbid,
						membership.groupName
					)

					// Upsert the membership period
					const upsertResult = await upsertMembershipPeriod(
						artistId,
						groupId,
						{
							beginDate: membership.beginDate,
							endDate: membership.endDate,
							ended: membership.ended,
						}
					)

					if (upsertResult.inserted) result.membershipsInserted++
					if (upsertResult.updated) result.membershipsUpdated++
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error)
					result.errors.push(
						`Error processing group ${membership.groupName}: ${message}`
					)
				}
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		result.errors.push(`Sync failed: ${message}`)
	}

	return result
}

// =============================================================================
// Track Sync
// =============================================================================

/**
 * Result of syncing a track
 */
export interface SyncTrackResult {
	/** Track database ID */
	trackId: string | null
	/** Whether the track was found in MusicBrainz */
	found: boolean
	/** Whether any data was updated */
	updated: boolean
	/** Errors encountered */
	errors: string[]
}

/**
 * Syncs a track's metadata from MusicBrainz by its database ID.
 * Updates the track record with fresh MB data if the track has an MBID.
 *
 * @param trackId - Track database ID
 * @returns Sync result
 */
export async function syncTrackById(trackId: string): Promise<SyncTrackResult> {
	const result: SyncTrackResult = {
		trackId,
		found: false,
		updated: false,
		errors: [],
	}

	try {
		// Get track from database
		const track = await db.query.tracks.findFirst({
			where: (t, { eq }) => eq(t.id, trackId),
		})

		if (!track) {
			result.errors.push(`Track not found in database: ${trackId}`)
			return result
		}

		if (!track.mbid) {
			result.errors.push('Track has no MBID - cannot sync')
			return result
		}

		// Fetch recording details from MusicBrainz
		const mbRecording = await getRecordingDetails(track.mbid)
		if (!mbRecording) {
			result.errors.push(
				`Recording not found in MusicBrainz: ${track.mbid}`
			)
			return result
		}

		result.found = true

		// Update track with MB data
		const updates: Partial<typeof tracks.$inferInsert> = {}

		if (mbRecording.title && mbRecording.title !== track.title) {
			updates.title = mbRecording.title
		}

		if (mbRecording.length && mbRecording.length !== track.duration_ms) {
			updates.duration_ms = mbRecording.length
		}

		// Update ISRC if MB has one and we don't
		if (mbRecording.isrcs && mbRecording.isrcs.length > 0 && !track.isrc) {
			updates.isrc = mbRecording.isrcs[0]
		}

		if (Object.keys(updates).length > 0) {
			await db.update(tracks).set(updates).where(eq(tracks.id, trackId))
			result.updated = true
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		result.errors.push(`Sync failed: ${message}`)
	}

	return result
}

// =============================================================================
// Album Sync
// =============================================================================

/**
 * Result of syncing an album
 */
export interface SyncAlbumResult {
	/** Album database ID */
	albumId: string | null
	/** Whether the album was found in MusicBrainz */
	found: boolean
	/** Whether any data was updated */
	updated: boolean
	/** Whether cover art was fetched */
	coverArtFetched: boolean
	/** Errors encountered */
	errors: string[]
}

/**
 * Syncs an album's metadata from MusicBrainz by its database ID.
 * Updates the album record with fresh MB data and fetches cover art.
 *
 * @param albumId - Album database ID
 * @returns Sync result
 */
export async function syncAlbumById(albumId: string): Promise<SyncAlbumResult> {
	const result: SyncAlbumResult = {
		albumId,
		found: false,
		updated: false,
		coverArtFetched: false,
		errors: [],
	}

	try {
		// Get album from database
		const album = await db.query.albums.findFirst({
			where: (a, { eq }) => eq(a.id, albumId),
		})

		if (!album) {
			result.errors.push(`Album not found in database: ${albumId}`)
			return result
		}

		if (!album.mbid) {
			result.errors.push('Album has no MBID - cannot sync')
			return result
		}

		// Fetch release details from MusicBrainz
		const mbRelease = await getReleaseDetails(album.mbid)
		if (!mbRelease) {
			result.errors.push(
				`Release not found in MusicBrainz: ${album.mbid}`
			)
			return result
		}

		result.found = true

		// Update album with MB data
		const updates: Partial<typeof albums.$inferInsert> = {}

		if (mbRelease.title && mbRelease.title !== album.title) {
			updates.title = mbRelease.title
		}

		if (mbRelease.date && mbRelease.date !== album.release_date) {
			updates.release_date = mbRelease.date
		}

		// Fetch cover art if we don't have one
		if (!album.image_url) {
			const coverUrl = await getReleaseCoverUrl(album.mbid)
			if (coverUrl) {
				updates.image_url = coverUrl
				result.coverArtFetched = true
			}
		}

		if (Object.keys(updates).length > 0) {
			await db.update(albums).set(updates).where(eq(albums.id, albumId))
			result.updated = true
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		result.errors.push(`Sync failed: ${message}`)
	}

	return result
}
