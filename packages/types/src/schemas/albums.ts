import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { albums } from "../db/schema";

export const albumSchema = createSelectSchema(albums);
export const createAlbumSchema = createInsertSchema(albums);
export const updateAlbumSchema = createUpdateSchema(albums);