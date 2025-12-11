import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { track_artists } from "@playbacc/api/src/db/schema";

export const trackArtistSchema = createSelectSchema(track_artists);
export const createTrackArtistSchema = createInsertSchema(track_artists);
export const updateTrackArtistSchema = createUpdateSchema(track_artists);