import { z } from "zod";

// Track Schema
export const trackSchema = z.object({
    id: z.uuid(),
    title: z.string(),
    duration_ms: z.number().nullish(),
    mbid: z.string().nullish(),
    isrc: z.string().nullish(),
    explicit: z.boolean(),
});

// Track Type
export type Track = z.infer<typeof trackSchema>;

// Insert Schema
export const createTrackSchema = trackSchema.omit({
    id: true,
});

// Update Schema
export const updateTrackSchema = trackSchema.partial().omit({
    id: true,
});