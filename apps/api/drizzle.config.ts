import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: [
		'./node_modules/@playbacc/types/src/db/enums.ts',
		'./node_modules/@playbacc/types/src/db/schema.ts',
	],
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
})
