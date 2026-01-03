/**
 * Authentication middleware for Hono
 *
 * Verifies JWT tokens and ensures Spotify access tokens are fresh.
 * Automatically refreshes expired tokens when a valid refresh token is available.
 */

import { Context, Next } from 'hono'
import { verifyToken } from '../lib/jwt'
import { db } from '../db'
import {
	refreshAccessToken,
	calculateExpiresAt,
	isTokenExpired,
} from '../lib/spotify'
import { accounts } from '@playbacc/types/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Authentication middleware that validates JWT tokens and manages Spotify token refresh.
 *
 * Sets `account` and `user` on the context if authentication succeeds.
 * Automatically refreshes expired Spotify tokens when possible.
 *
 * @param ctx - Hono context
 * @param next - Next middleware function
 * @returns Response if authentication fails, otherwise continues to next middleware
 */
export const authenticate = async (ctx: Context, next: Next) => {
	const authHeader = ctx.req.header('Authorization')

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return ctx.json(
			{ error: 'Missing or invalid authorization header' },
			401
		)
	}

	const token = authHeader.split(' ')[1]
	const payload = await verifyToken(token)

	if (!payload) {
		return ctx.json({ error: 'Invalid or expired token' }, 401)
	}

	try {
		const account = await db.query.accounts.findFirst({
			where: (accounts, { eq, and }) =>
				and(
					eq(accounts.provider, 'spotify'),
					eq(accounts.external_id, payload.external_id)
				),
		})

		if (!account || !account.user_id) {
			return ctx.json({ error: 'Account not found' }, 404)
		}

		// Check if token needs refresh
		if (account.refresh_token && isTokenExpired(account.expires_in)) {
			try {
				console.log(
					`[Auth] Refreshing expired token for account ${account.id}`
				)
				const tokenResponse = await refreshAccessToken(
					account.refresh_token
				)
				const expiresAt = calculateExpiresAt(tokenResponse.expires_in)

				await db
					.update(accounts)
					.set({
						access_token: tokenResponse.access_token,
						refresh_token:
							tokenResponse.refresh_token ??
							account.refresh_token,
						expires_in: expiresAt,
					})
					.where(eq(accounts.id, account.id))

				// Update the account object with new token for use in this request
				account.access_token = tokenResponse.access_token
				account.expires_in = expiresAt
			} catch (error) {
				console.error(
					`[Auth] Error refreshing access token for account ${account.id}:`,
					error
				)
				// Continue with potentially stale token - some endpoints may still work
			}
		}

		const user = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.id, account.user_id),
		})

		if (!user) {
			return ctx.json({ error: 'User not found' }, 404)
		}

		ctx.set('account', account)
		ctx.set('user', user)

		await next()
	} catch (error) {
		console.error('[Auth] Error verifying token:', error)
		return ctx.json({ error: 'Authentication failed' }, 500)
	}
}
