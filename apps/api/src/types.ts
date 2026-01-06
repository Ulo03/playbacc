/**
 * Shared types for the API
 *
 * Defines context variables set by middleware and available in routes.
 */

import type { accounts, users } from '@playbacc/types/db/schema'

/**
 * Type representing a row from the accounts table
 */
export type Account = typeof accounts.$inferSelect

/**
 * Type representing a row from the users table
 */
export type User = typeof users.$inferSelect

/**
 * Variables set on the Hono context by middleware
 */
export interface AppVariables {
	account: Account
	user: User
}
