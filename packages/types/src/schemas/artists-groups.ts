import { z } from "zod";

// Artist Group Schema
export const artistGroupSchema = z.object({
    member_id: z.uuid(),
    group_id: z.uuid(),
});

// Artist Group Type
export type ArtistGroup = z.infer<typeof artistGroupSchema>;

// Insert Schema
export const createArtistGroupSchema = artistGroupSchema;