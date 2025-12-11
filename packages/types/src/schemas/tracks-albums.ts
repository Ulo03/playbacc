import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { track_albums } from "../db/schema";

export const trackAlbumSchema = createSelectSchema(track_albums);
export const createTrackAlbumSchema = createInsertSchema(track_albums);
export const updateTrackAlbumSchema = createUpdateSchema(track_albums);