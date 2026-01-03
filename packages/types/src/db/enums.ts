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
