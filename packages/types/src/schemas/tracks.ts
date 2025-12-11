import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { tracks } from "@playbacc/api/src/db/schema";

export const trackSchema = createSelectSchema(tracks);
export const createTrackSchema = createInsertSchema(tracks);
export const updateTrackSchema = createUpdateSchema(tracks);