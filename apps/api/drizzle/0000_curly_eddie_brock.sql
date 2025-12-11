CREATE TYPE "public"."account_provider" AS ENUM('spotify');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" "account_provider" NOT NULL,
	"external_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_in" integer,
	"scope" text
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid,
	"title" text NOT NULL,
	"release_date" date,
	"image_url" text,
	"mbid" text,
	CONSTRAINT "albums_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mbid" text,
	"image_url" text,
	CONSTRAINT "artists_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "artists_groups" (
	"member_id" uuid,
	"group_id" uuid,
	CONSTRAINT "artists_groups_pk" PRIMARY KEY("member_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "scrobbles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"track_id" uuid,
	"album_id" uuid,
	"played_at" timestamp NOT NULL,
	"played_duration_ms" integer NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"provider" "account_provider" NOT NULL,
	CONSTRAINT "no_duplicate_scrobbles" UNIQUE("user_id","track_id","played_at")
);
--> statement-breakpoint
CREATE TABLE "track_albums" (
	"track_id" uuid,
	"album_id" uuid,
	"disc_number" integer,
	"position" integer,
	CONSTRAINT "track_albums_pk" PRIMARY KEY("track_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"track_id" uuid,
	"artist_id" uuid,
	"is_primary" boolean DEFAULT true NOT NULL,
	"order" integer NOT NULL,
	"join_phrase" text DEFAULT '' NOT NULL,
	CONSTRAINT "track_artists_pk" PRIMARY KEY("track_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"duration_ms" integer,
	"mbid" text,
	"isrc" text,
	"explicit" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tracks_mbid_unique" UNIQUE("mbid"),
	CONSTRAINT "tracks_isrc_unique" UNIQUE("isrc")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"image_url" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists_groups" ADD CONSTRAINT "artists_groups_member_id_artists_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists_groups" ADD CONSTRAINT "artists_groups_group_id_artists_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;