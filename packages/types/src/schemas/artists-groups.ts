import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { artists_groups } from "../db/schema";

export const artistGroupSchema = createSelectSchema(artists_groups);
export const createArtistGroupSchema = createInsertSchema(artists_groups);