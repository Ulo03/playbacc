import { z } from "zod";

// Track Album Schema
export const trackAlbumSchema = z.object({
    track_id: z.uuid(),
    album_id: z.uuid(),
    disc_number: z.number().nullish(),
    position: z.number().nullish(),
});

// Track Album Type
export type TrackAlbum = z.infer<typeof trackAlbumSchema>;

// Insert Schema
export const createTrackAlbumSchema = trackAlbumSchema;