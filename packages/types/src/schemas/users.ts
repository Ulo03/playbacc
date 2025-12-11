import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { users } from "../db/schema";

export const userSchema = createSelectSchema(users);
export const createUserSchema = createInsertSchema(users);
export const updateUserSchema = createUpdateSchema(users);