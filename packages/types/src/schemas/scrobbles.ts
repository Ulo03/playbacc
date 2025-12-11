import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { scrobbles } from "@playbacc/api/src/db/schema";

// Scrobble Schema
export const scrobbleSchema = createSelectSchema(scrobbles);
export const createScrobbleSchema = createInsertSchema(scrobbles);
export const updateScrobbleSchema = createUpdateSchema(scrobbles);