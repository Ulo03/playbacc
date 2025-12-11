import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { artists } from "@playbacc/api/src/db/schema";

export const artistSchema = createSelectSchema(artists);
export const createArtistSchema = createInsertSchema(artists);
export const updateArtistSchema = createUpdateSchema(artists);