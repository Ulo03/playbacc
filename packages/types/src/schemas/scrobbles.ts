import { z } from "zod";

// Scrobble Schema
export const scrobbleSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    track_id: z.uuid(),
    album_id: z.uuid().nullish(),
    played_at: z.iso.datetime({ offset: true }),
    played_duration_ms: z.number().nullish(),
    skipped: z.boolean().nullish(),
});

// Scrobble Type
export type Scrobble = z.infer<typeof scrobbleSchema>;

// Insert Schema
export const createScrobbleSchema = scrobbleSchema.omit({
    id: true,
});

// Update Schema
export const updateScrobbleSchema = scrobbleSchema.partial().omit({
    id: true,
});