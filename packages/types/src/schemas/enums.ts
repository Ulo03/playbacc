import { createSelectSchema } from "drizzle-zod";
import { accountProviderEnum, userRoleEnum } from "../db/enums";

// Account Provider Enum
export const accountProviderSchema = createSelectSchema(accountProviderEnum);

// User Role Enum
export const userRoleSchema = createSelectSchema(userRoleEnum);
