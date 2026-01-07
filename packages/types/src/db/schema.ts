import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
	accountProviderEnum,
	artistTypeEnum,
	genderEnum,
	importStatusEnum,
	mbEnrichmentEntityTypeEnum,
	mbEnrichmentJobStatusEnum,
	mbEnrichmentJobTypeEnum,
	userRoleEnum,
} from './enums'

// Users Table
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	username: text('username').unique(),
	image_url: text('image_url'),
	role: userRoleEnum('role').notNull().default('user'),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Accounts Table
export const accounts = pgTable('accounts', {
	id: uuid('id').primaryKey().defaultRandom(),
	user_id: uuid('user_id')
		.notNull()
		.references(() => users.id),
	provider: accountProviderEnum('provider').notNull(),
	external_id: text('external_id').notNull().unique(),
	access_token: text('access_token'),
	refresh_token: text('refresh_token'),
	expires_in: integer('expires_in'),
	scope: text('scope'),
})

// Artists Table
export const artists = pgTable('artists', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	mbid: text('mbid').unique(),
	/** Artist type from MusicBrainz (Person, Group, Orchestra, Choir, Character, Other) */
	type: artistTypeEnum('type'),
	/** Gender (only for Person artists) */
	gender: genderEnum('gender'),
	/** Birth date for Person, founding date for Group (raw string from MB: YYYY, YYYY-MM, or YYYY-MM-DD) */
	begin_date: text('begin_date'),
	/** Death date for Person, dissolution date for Group */
	end_date: text('end_date'),
	image_url: text('image_url'),
	/** Last time MusicBrainz enrichment was performed */
	mb_last_enriched_at: timestamp('mb_last_enriched_at', { withTimezone: true }),
})

// Artists Groups Table - tracks group memberships with time periods
// Supports multiple membership stints (leave/rejoin) per member+group pair
export const artists_groups = pgTable(
	'artists_groups',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		member_id: uuid('member_id')
			.notNull()
			.references(() => artists.id),
		group_id: uuid('group_id')
			.notNull()
			.references(() => artists.id),
		/** When membership started (normalized date from MusicBrainz) */
		begin_date: date('begin_date'),
		/** When membership ended (normalized date), null if still active */
		end_date: date('end_date'),
		/** Raw begin date string from MusicBrainz (YYYY, YYYY-MM, or YYYY-MM-DD) */
		begin_raw: text('begin_raw'),
		/** Raw end date string from MusicBrainz */
		end_raw: text('end_raw'),
		/** Whether the membership has ended */
		ended: boolean('ended').notNull().default(false),
	},
	(table) => [
		index('idx_artists_groups_member').on(table.member_id),
		index('idx_artists_groups_group').on(table.group_id),
		unique('idx_artists_groups_unique_period').on(
			table.member_id,
			table.group_id,
			table.begin_raw,
			table.end_raw
		),
	]
)

// Albums Table
export const albums = pgTable('albums', {
	id: uuid('id').primaryKey().defaultRandom(),
	artist_id: uuid('artist_id')
		.notNull()
		.references(() => artists.id),
	title: text('title').notNull(),
	release_date: date('release_date'),
	image_url: text('image_url'),
	mbid: text('mbid').unique(),
	/** Last time MusicBrainz enrichment was performed */
	mb_last_enriched_at: timestamp('mb_last_enriched_at', { withTimezone: true }),
})

// Tracks Table
export const tracks = pgTable('tracks', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	duration_ms: integer('duration_ms'),
	mbid: text('mbid').unique(),
	isrc: text('isrc').unique(),
	explicit: boolean('explicit').notNull().default(false),
	/** Last time MusicBrainz enrichment was performed */
	mb_last_enriched_at: timestamp('mb_last_enriched_at', { withTimezone: true }),
})

// Track Artists Table
export const track_artists = pgTable(
	'track_artists',
	{
		track_id: uuid('track_id')
			.notNull()
			.references(() => tracks.id),
		artist_id: uuid('artist_id')
			.notNull()
			.references(() => artists.id),
		is_primary: boolean('is_primary').notNull().default(true),
		order: integer('order').notNull(),
		join_phrase: text('join_phrase').notNull().default(''),
	},
	(table) => [
		primaryKey({
			name: 'track_artists_pk',
			columns: [table.track_id, table.artist_id],
		}),
	]
)

// Track Albums Table
export const track_albums = pgTable(
	'track_albums',
	{
		track_id: uuid('track_id')
			.notNull()
			.references(() => tracks.id),
		album_id: uuid('album_id')
			.notNull()
			.references(() => albums.id),
		disc_number: integer('disc_number'),
		position: integer('position'),
	},
	(table) => [
		primaryKey({
			name: 'track_albums_pk',
			columns: [table.track_id, table.album_id],
		}),
	]
)

// Imports Table
export const imports = pgTable(
	'imports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: uuid('user_id')
			.notNull()
			.references(() => users.id),
		filename: text('filename').notNull(),
		file_hash: text('file_hash').notNull(),
		file_size: integer('file_size').notNull(),
		file_path: text('file_path').notNull(),
		status: importStatusEnum('status').notNull().default('pending'),
		total_records: integer('total_records'),
		imported_records: integer('imported_records').default(0),
		failed_records: integer('failed_records').default(0),
		error_message: jsonb('error_message'),
		started_at: timestamp('started_at', { withTimezone: true }),
		completed_at: timestamp('completed_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('idx_imports_user').on(table.user_id),
		unique('idx_imports_file_hash').on(table.file_hash),
		index('idx_imports_status').on(table.status),
	]
)

// Scrobbles Table
export const scrobbles = pgTable(
	'scrobbles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: uuid('user_id')
			.notNull()
			.references(() => users.id),
		track_id: uuid('track_id')
			.notNull()
			.references(() => tracks.id),
		album_id: uuid('album_id').references(() => albums.id),
		played_at: timestamp('played_at', { withTimezone: true }).notNull(),
		played_duration_ms: integer('played_duration_ms').notNull().default(0),
		skipped: boolean('skipped').notNull().default(false),
		import_id: uuid('import_id').references(() => imports.id),
		provider: accountProviderEnum('provider').notNull(),
	},
	(table) => [
		unique('no_duplicate_scrobbles').on(
			table.user_id,
			table.track_id,
			table.played_at
		),
		index('idx_scrobbles_import').on(table.import_id),
		index('idx_no_duplicate_scrobbles').on(
			table.user_id,
			table.track_id,
			table.played_at
		),
	]
)

// Scrobble State Table - tracks the last processed play for each user/provider
export const scrobble_state = pgTable(
	'scrobble_state',
	{
		user_id: uuid('user_id')
			.notNull()
			.references(() => users.id),
		provider: accountProviderEnum('provider').notNull(),
		last_played_at: timestamp('last_played_at', { withTimezone: true }),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			name: 'scrobble_state_pk',
			columns: [table.user_id, table.provider],
		}),
	]
)

// Playback Sessions Table - tracks currently active playback for real-time scrobbling
// One row per user/provider; stores in-progress play state for accurate duration tracking
export const playback_sessions = pgTable(
	'playback_sessions',
	{
		user_id: uuid('user_id')
			.notNull()
			.references(() => users.id),
		provider: accountProviderEnum('provider').notNull(),
		/** Track URI (e.g. spotify:track:...) - use extractTrackIdFromUri() to get the ID */
		track_uri: text('track_uri').notNull(),
		/** When this specific play instance started */
		started_at: timestamp('started_at', { withTimezone: true }).notNull(),
		/** Last time we polled and saw this track */
		last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
		/** Progress in ms at last poll */
		last_progress_ms: integer('last_progress_ms').notNull().default(0),
		/** Total accumulated listening time in ms (only counted while playing) */
		accumulated_ms: integer('accumulated_ms').notNull().default(0),
		/** Whether track was playing at last poll */
		is_playing: boolean('is_playing').notNull().default(false),
		/** Track duration in ms (from Spotify) */
		track_duration_ms: integer('track_duration_ms'),
		/** Spotify track metadata snapshot (for finalization when track changes) */
		track_metadata: jsonb('track_metadata'),
		/** Whether this session has already been scrobbled (prevents double-scrobble on pause/resume) */
		scrobbled: boolean('scrobbled').notNull().default(false),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			name: 'playback_sessions_pk',
			columns: [table.user_id, table.provider],
		}),
	]
)

// MusicBrainz Enrichment Jobs Table - background job queue for MB metadata enrichment
// Jobs are enqueued when entities are created/updated and processed by the MB worker
export const mb_enrichment_jobs = pgTable(
	'mb_enrichment_jobs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Type of enrichment job to perform */
		job_type: mbEnrichmentJobTypeEnum('job_type').notNull(),
		/** Entity type (artist, album, track) */
		entity_type: mbEnrichmentEntityTypeEnum('entity_type').notNull(),
		/** ID of the entity to enrich */
		entity_id: uuid('entity_id').notNull(),
		/** Job status */
		status: mbEnrichmentJobStatusEnum('status').notNull().default('pending'),
		/** Priority (higher = processed first) */
		priority: integer('priority').notNull().default(0),
		/** Number of attempts made */
		attempts: integer('attempts').notNull().default(0),
		/** Maximum attempts before marking as permanently failed */
		max_attempts: integer('max_attempts').notNull().default(3),
		/** Don't run before this time (for retry backoff) */
		run_after: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
		/** When job was locked for processing */
		locked_at: timestamp('locked_at', { withTimezone: true }),
		/** Worker instance that locked this job */
		locked_by: text('locked_by'),
		/** Last error message if failed */
		last_error: text('last_error'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		// Index for efficient job claiming (pending jobs ready to run, ordered by priority)
		index('idx_mb_jobs_claimable').on(
			table.status,
			table.run_after,
			table.priority
		),
		// Index for cleanup queries (by status and updated_at)
		index('idx_mb_jobs_cleanup').on(table.status, table.updated_at),
		// Partial unique index to prevent duplicate active jobs (race condition protection)
		// Only one pending/running job allowed per (job_type, entity_type, entity_id)
		uniqueIndex('idx_mb_jobs_active_dedupe')
			.on(table.job_type, table.entity_type, table.entity_id)
			.where(sql`${table.status} IN ('pending', 'running')`),
	]
)
