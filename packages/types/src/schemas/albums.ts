import { z } from "zod";

// Album Schema
export const albumSchema = z.object({
    id: z.uuid(),
    artist_id: z.uuid(),
    title: z.string(),
    release_date: z.date().nullish(),
    image_url: z.url().nullish(),
    mbid: z.string().nullish(),
});

// Album Type
export type Album = z.infer<typeof albumSchema>;

// Insert Schema
export const createAlbumSchema = albumSchema.omit({
    id: true,
});

// Update Schema
export const updateAlbumSchema = albumSchema.partial().omit({
    id: true,
});