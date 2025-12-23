import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { imports } from "../db/schema";

export const importSchema = createSelectSchema(imports);
export const createImportSchema = createInsertSchema(imports);
export const updateImportSchema = createUpdateSchema(imports);