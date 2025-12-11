import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { accounts } from "../db/schema";

export const accountSchema = createSelectSchema(accounts);
export const createAccountSchema = createInsertSchema(accounts);
export const updateAccountSchema = createUpdateSchema(accounts);