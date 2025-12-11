import { z } from "zod";
import { accountProviderSchema } from "./enums";

// Scrobble Schema
export const scrobbleSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    track_id: z.uuid(),
    album_id: z.uuid().nullish(),
    played_at: z.iso.datetime({ offset: true }),
    played_duration_ms: z.number(),
    skipped: z.boolean().default(false),
    is_imported: z.boolean().default(false),
    provider: accountProviderSchema,
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