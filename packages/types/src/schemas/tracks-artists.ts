import { z } from "zod";

// Track Artist Schema
export const trackArtistSchema = z.object({
    track_id: z.uuid(),
    artist_id: z.uuid(),
    is_primary: z.boolean().default(true),
    order: z.number(),
    join_phrase: z.string().default(""),
});

// Track Artist Type
export type TrackArtist = z.infer<typeof trackArtistSchema>;

// Insert Schema
export const createTrackArtistSchema = trackArtistSchema;