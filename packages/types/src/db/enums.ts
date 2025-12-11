import { pgEnum } from "drizzle-orm/pg-core";

// User Role Enum
export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);

// Account Provider Enum
export const accountProviderEnum = pgEnum("account_provider", ["spotify"]);

