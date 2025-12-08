import { z } from "zod";

// Artist Schema
export const artistSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    mbid: z.string().nullish(),
    image_url: z.url().nullish(),
});

// Artist Type
export type Artist = z.infer<typeof artistSchema>;

// Insert Schema
export const createArtistSchema = artistSchema.omit({
    id: true,
});

// Update Schema
export const updateArtistSchema = artistSchema.partial().omit({
    id: true,
});