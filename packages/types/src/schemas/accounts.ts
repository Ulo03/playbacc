import { z } from "zod";
import { accountProviderSchema } from "./enums";

// Account Schema
export const accountSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    provider: accountProviderSchema,
    provider_account_id: z.string(),
    access_token: z.string().nullish(),
    refresh_token: z.string().nullish(),
    expires_at: z.number().nullish(),
    scope: z.string().nullish(),
});

// Account Type
export type Account = z.infer<typeof accountSchema>;

// Insert Schema
export const createAccountSchema = accountSchema.omit({
    id: true,
});

// Update Schema
export const updateAccountSchema = accountSchema.partial().omit({
    id: true,
});