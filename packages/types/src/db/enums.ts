import { pgEnum } from 'drizzle-orm/pg-core'

// User Role Enum
export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])

// Account Provider Enum
export const accountProviderEnum = pgEnum('account_provider', ['spotify'])

// Import Status Enum
export const importStatusEnum = pgEnum('import_status', [
	'pending',
	'processing',
	'completed',
	'failed',
])

// Artist Type Enum (from MusicBrainz)
// https://musicbrainz.org/doc/Artist
export const artistTypeEnum = pgEnum('artist_type', [
	'person',
	'group',
	'orchestra',
	'choir',
	'character',
	'other',
])

// Gender Enum (for Person artists)
export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])

// MusicBrainz Enrichment Job Status Enum
export const mbEnrichmentJobStatusEnum = pgEnum('mb_enrichment_job_status', [
	'pending',
	'running',
	'succeeded',
	'failed',
])

// MusicBrainz Enrichment Job Type Enum
export const mbEnrichmentJobTypeEnum = pgEnum('mb_enrichment_job_type', [
	'artist.resolve_mbid',
	'artist.sync_relationships',
	'album.resolve_mbid',
	'album.sync',
	'track.resolve_mbid',
	'track.sync',
])

// MusicBrainz Enrichment Entity Type Enum
export const mbEnrichmentEntityTypeEnum = pgEnum('mb_enrichment_entity_type', [
	'artist',
	'album',
	'track',
])