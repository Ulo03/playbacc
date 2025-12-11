import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { artists_groups } from "@playbacc/api/src/db/schema";

export const artistGroupSchema = createSelectSchema(artists_groups);
export const createArtistGroupSchema = createInsertSchema(artists_groups);