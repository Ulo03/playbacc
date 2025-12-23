import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountProviderEnum, importStatusEnum, userRoleEnum } from './enums';

// Users Table
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    username: text('username').unique(),
    image_url: text('image_url'),
    role: userRoleEnum('role').notNull().default('user'),
    created_at: timestamp('created_at').notNull().defaultNow(),
});

// Accounts Table
export const accounts = pgTable('accounts', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => users.id),
    provider: accountProviderEnum('provider').notNull(),
    external_id: text('external_id').notNull().unique(),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    expires_in: integer('expires_in'),
    scope: text('scope'),
});

// Artists Table
export const artists = pgTable('artists', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    mbid: text('mbid').unique(),
    image_url: text('image_url'),
});

// Artists Groups Table
export const artists_groups = pgTable('artists_groups', {
    member_id: uuid('member_id').notNull().references(() => artists.id),
    group_id: uuid('group_id').notNull().references(() => artists.id),
}, (table) => [
    primaryKey({ name: 'artists_groups_pk', columns: [table.member_id, table.group_id] }),
]);

// Albums Table
export const albums = pgTable('albums', {
    id: uuid('id').primaryKey().defaultRandom(),
    artist_id: uuid('artist_id').notNull().references(() => artists.id),
    title: text('title').notNull(),
    release_date: date('release_date'),
    image_url: text('image_url'),
    mbid: text('mbid').unique(),
});

// Tracks Table
export const tracks = pgTable('tracks', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    duration_ms: integer('duration_ms'),
    mbid: text('mbid').unique(),
    isrc: text('isrc').unique(),
    explicit: boolean('explicit').notNull().default(false),
});

// Track Artists Table
export const track_artists = pgTable('track_artists', {
    track_id: uuid('track_id').notNull().references(() => tracks.id),
    artist_id: uuid('artist_id').notNull().references(() => artists.id),
    is_primary: boolean('is_primary').notNull().default(true),
    order: integer('order').notNull(),
    join_phrase: text('join_phrase').notNull().default(''),
}, (table) => [
    primaryKey({ name: 'track_artists_pk', columns: [table.track_id, table.artist_id] }),
]);

// Track Albums Table
export const track_albums = pgTable('track_albums', {
    track_id: uuid('track_id').notNull().references(() => tracks.id),
    album_id: uuid('album_id').notNull().references(() => albums.id),
    disc_number: integer('disc_number'),
    position: integer('position'),
}, (table) => [
    primaryKey({ name: 'track_albums_pk', columns: [table.track_id, table.album_id] }),
]);

// Imports Table
export const imports = pgTable('imports', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => users.id),
    filename: text('filename').notNull(),
    file_hash: text('file_hash').notNull(),
    file_size: integer('file_size').notNull(),
    file_path: text('file_path').notNull(),
    status: importStatusEnum('status').notNull().default('pending'),
    total_records: integer('total_records'),
    imported_records: integer('imported_records').default(0),
    failed_records: integer('failed_records').default(0),
    error_message: jsonb('error_message'),
    started_at: timestamp('started_at'),
    completed_at: timestamp('completed_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
    index('idx_imports_user').on(table.user_id),
    unique('idx_imports_file_hash').on(table.file_hash),
    index('idx_imports_status').on(table.status),
]);

// Scrobbles Table
export const scrobbles = pgTable('scrobbles', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => users.id),
    track_id: uuid('track_id').notNull().references(() => tracks.id),
    album_id: uuid('album_id').references(() => albums.id),
    played_at: timestamp('played_at').notNull(),
    played_duration_ms: integer('played_duration_ms').notNull().default(0),
    skipped: boolean('skipped').notNull().default(false),
    import_id: uuid('import_id').references(() => imports.id),
    provider: accountProviderEnum('provider').notNull(),
}, (table) => [
    unique('no_duplicate_scrobbles').on(table.user_id, table.track_id, table.played_at),
<<<<<<< Updated upstream
]);

index('idx_no_duplicate_scrobbles').on(scrobbles.user_id, scrobbles.track_id, scrobbles.played_at);
=======
    index('idx_scrobbles_import').on(table.import_id),
]);
>>>>>>> Stashed changes
