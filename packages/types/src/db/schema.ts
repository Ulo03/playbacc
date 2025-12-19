import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountProviderEnum, userRoleEnum } from './enums';

// Users Table
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    username: text('username').unique(),
    image_url: text('image_url'),
    is_public: boolean('is_public').notNull().default(true),
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

// Scrobbles Table
export const scrobbles = pgTable('scrobbles', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => users.id),
    track_id: uuid('track_id').notNull().references(() => tracks.id),
    album_id: uuid('album_id').references(() => albums.id),
    played_at: timestamp('played_at').notNull(),
    played_duration_ms: integer('played_duration_ms').notNull().default(0),
    skipped: boolean('skipped').notNull().default(false),
    is_imported: boolean('is_imported').notNull().default(false),
    provider: accountProviderEnum('provider').notNull(),
}, (table) => [
    unique('no_duplicate_scrobbles').on(table.user_id, table.track_id, table.played_at),
]);

index('idx_no_duplicate_scrobbles').on(scrobbles.user_id, scrobbles.track_id, scrobbles.played_at);