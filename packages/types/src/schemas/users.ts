import { z } from "zod";
import { userRoleSchema } from "./enums";

// User Schema
export const userSchema = z.object({
    id: z.uuid(),
    email: z.email(),
    username: z.string().nullish(),
    image_url: z.url().nullish(),
    role: userRoleSchema,
    created_at: z.iso.datetime({ offset: true }),
});

// User Type
export type User = z.infer<typeof userSchema>;

// Insert Schema
export const createUserSchema = userSchema.omit({
    id: true,
    created_at: true,
});

// Update Schema
export const updateUserSchema = userSchema.omit({
    id: true,
    created_at: true,
});