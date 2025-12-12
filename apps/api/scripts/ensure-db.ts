import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

const url = new URL(connectionString);
const dbName = url.pathname.slice(1);
const serverUrl = connectionString.replace(`/${dbName}`, "/postgres");

const sql = postgres(serverUrl);

try {
	const exists = await sql`
	SELECT 1 FROM pg_database WHERE datname = ${dbName}
	`;

	if (exists.length === 0) {
		console.log(`Creating database: ${dbName}`);
		await sql.unsafe(`CREATE DATABASE "${dbName}"`);
		console.log(`✓ Database created`);
	} else {
		console.log(`✓ Database already exists`);
	}
} finally {
	await sql.end();
}