import { z } from "zod";

// Account Provider Enum
export const accountProviderSchema = z.enum(["spotify"]);
export type AccountProvider = z.infer<typeof accountProviderSchema>;

// User Role Enum
export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;
