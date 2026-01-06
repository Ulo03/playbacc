import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@playbacc/types/db/schema'

// Database Connection String
const connectionString = process.env.DATABASE_URL!
if (!connectionString) {
	throw new Error('DATABASE_URL is not set')
}

// Create postgres client with UTC timezone for consistency
const client = postgres(connectionString, {
	connection: {
		TimeZone: 'UTC',
	},
})

// Drizzle ORM
export const db = drizzle(client, {
	schema: schema,
})

// Export transaction type for use in functions that need to accept a transaction
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbClient = typeof db | DbTransaction
