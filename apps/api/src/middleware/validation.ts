import { Context, Next } from 'hono'
import { ZodType } from 'zod'

/**
 * SchemaValidation Middleware
 * @param schema The Zod schema to validate the request body against
 * @returns A middleware function that validates the request body against the schema
 */
export const validate = <T extends ZodType<unknown>>(schema: T) => {
	return async (c: Context, next: Next) => {
		try {
			const body = await c.req.json()
			const result = schema.safeParse(body)
			if (!result.success) {
				return c.json({ error: result.error.message }, 400)
			}
			await next()
		} catch (error) {
			return c.json({ error: 'Invalid JSON in request body' }, 400)
		}
	}
}
