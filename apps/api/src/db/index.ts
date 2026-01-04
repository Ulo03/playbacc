import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@playbacc/types/db/schema'

// Database Connection String
const connectionString = process.env.DATABASE_URL!
if (!connectionString) {
	throw new Error('DATABASE_URL is not set')
}

// Drizzle ORM
export const db = drizzle({
	connection: {
		url: connectionString,
	},
	schema: schema,
})
