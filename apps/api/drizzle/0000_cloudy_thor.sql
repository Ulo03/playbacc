CREATE TYPE "public"."account_provider" AS ENUM('spotify');--> statement-breakpoint
CREATE TYPE "public"."artist_type" AS ENUM('person', 'group', 'orchestra', 'choir', 'character', 'other');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "account_provider" NOT NULL,
	"external_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_in" integer,
	"scope" text,
	CONSTRAINT "accounts_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
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
	"type" "artist_type",
	"gender" "gender",
	"begin_date" text,
	"end_date" text,
	"image_url" text,
	CONSTRAINT "artists_mbid_unique" UNIQUE("mbid")
);
--> statement-breakpoint
CREATE TABLE "artists_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"begin_date" date,
	"end_date" date,
	"begin_raw" text,
	"end_raw" text,
	"ended" boolean DEFAULT false NOT NULL,
	CONSTRAINT "idx_artists_groups_unique_period" UNIQUE("member_id","group_id","begin_raw","end_raw")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_path" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"total_records" integer,
	"imported_records" integer DEFAULT 0,
	"failed_records" integer DEFAULT 0,
	"error_message" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_imports_file_hash" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "playback_sessions" (
	"user_id" uuid NOT NULL,
	"provider" "account_provider" NOT NULL,
	"track_uri" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_progress_ms" integer DEFAULT 0 NOT NULL,
	"accumulated_ms" integer DEFAULT 0 NOT NULL,
	"is_playing" boolean DEFAULT false NOT NULL,
	"track_duration_ms" integer,
	"track_metadata" jsonb,
	"scrobbled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_sessions_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "scrobble_state" (
	"user_id" uuid NOT NULL,
	"provider" "account_provider" NOT NULL,
	"last_played_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrobble_state_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "scrobbles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"album_id" uuid,
	"played_at" timestamp with time zone NOT NULL,
	"played_duration_ms" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"import_id" uuid,
	"provider" "account_provider" NOT NULL,
	CONSTRAINT "no_duplicate_scrobbles" UNIQUE("user_id","track_id","played_at")
);
--> statement-breakpoint
CREATE TABLE "track_albums" (
	"track_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"disc_number" integer,
	"position" integer,
	CONSTRAINT "track_albums_pk" PRIMARY KEY("track_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"track_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
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
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists_groups" ADD CONSTRAINT "artists_groups_member_id_artists_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists_groups" ADD CONSTRAINT "artists_groups_group_id_artists_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobble_state" ADD CONSTRAINT "scrobble_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrobbles" ADD CONSTRAINT "scrobbles_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artists_groups_member" ON "artists_groups" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_artists_groups_group" ON "artists_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_imports_user" ON "imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_imports_status" ON "imports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_scrobbles_import" ON "scrobbles" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "idx_no_duplicate_scrobbles" ON "scrobbles" USING btree ("user_id","track_id","played_at");