import { createSelectSchema } from "drizzle-zod";
import { accountProviderEnum, importStatusEnum, userRoleEnum } from "../db/enums";

// Account Provider Enum
export const accountProviderSchema = createSelectSchema(accountProviderEnum);

// User Role Enum
export const userRoleSchema = createSelectSchema(userRoleEnum);

// Import Status Enum
export const importStatusSchema = createSelectSchema(importStatusEnum);