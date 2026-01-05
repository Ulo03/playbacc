import { Hono } from 'hono'
import {
	exchangeCodeForToken,
	getAuthUrl,
	getUserProfile,
	calculateExpiresAt,
} from '../lib/spotify'
import { db } from '../db'
import { eq } from 'drizzle-orm'
import { signToken } from '../lib/jwt'
import { accounts, users } from '@playbacc/types/db/schema'

const auth = new Hono()

/**
 * Initiates Spotify OAuth flow
 * 
 * Query params:
 * - redirect_uri: The frontend URL to redirect to after authentication
 *                 The token will be appended as ?token=xxx or ?error=xxx
 */
auth.get('/spotify/login', async (ctx) => {
	const redirectUri = ctx.req.query('redirect_uri')

	if (!redirectUri) {
		return ctx.json({ error: 'Missing redirect_uri parameter' }, 400)
	}

	const scope = [
		'user-read-private',
		'user-read-email',
		'user-read-recently-played',
		'user-read-currently-playing',
		'user-read-playback-state',
	]

	// Encode the frontend redirect URI in the state parameter
	const state = Buffer.from(JSON.stringify({ redirect_uri: redirectUri })).toString('base64url')
	const authUrl = getAuthUrl(state, scope)

	return ctx.redirect(authUrl)
})

/**
 * Handles Spotify OAuth callback
 * Redirects to the frontend with token or error
 */
auth.get('/spotify/callback', async (ctx) => {
	const code = ctx.req.query('code')
	const error = ctx.req.query('error')
	const state = ctx.req.query('state')

	// Decode the state to get the frontend redirect URI
	let redirectUri = process.env.FRONTEND_URL || 'http://localhost:5173'
	
	if (state) {
		try {
			const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
			if (decoded.redirect_uri) {
				redirectUri = decoded.redirect_uri
			}
		} catch {
			// If state decoding fails, use default redirect
			console.warn('Failed to decode OAuth state')
		}
	}

	// Helper to redirect with error
	const redirectWithError = (errorMessage: string) => {
		const url = new URL(redirectUri)
		url.searchParams.set('error', errorMessage)
		return ctx.redirect(url.toString())
	}

	// Helper to redirect with success
	const redirectWithToken = (token: string, user: { id: string; email: string; username: string | null; image_url?: string | null }) => {
		const url = new URL(redirectUri)
		url.searchParams.set('token', token)
		url.searchParams.set('user', Buffer.from(JSON.stringify(user)).toString('base64url'))
		return ctx.redirect(url.toString())
	}

	if (error) {
		return redirectWithError(error === 'access_denied' ? 'Access denied' : error)
	}

	if (!code) {
		return redirectWithError('Missing authorization code')
	}

	try {
		const tokenResponse = await exchangeCodeForToken(code)
		const spotifyUser = await getUserProfile(tokenResponse.access_token)

		const existingAccount = await db.query.accounts.findFirst({
			where: (accounts, { eq, and }) =>
				and(
					eq(accounts.external_id, spotifyUser.id),
					eq(accounts.provider, 'spotify')
				),
		})

		if (existingAccount && existingAccount.user_id) {
			const user = await db.query.users.findFirst({
				where: (users, { eq }) => eq(users.id, existingAccount.user_id),
			})

			if (!user) {
				return redirectWithError('User not found')
			}

			await db
				.update(accounts)
				.set({
					access_token: tokenResponse.access_token,
					refresh_token:
						tokenResponse.refresh_token ||
						existingAccount.refresh_token,
					expires_in: calculateExpiresAt(tokenResponse.expires_in),
					scope: tokenResponse.scope,
				})
				.where(eq(accounts.external_id, spotifyUser.id))

			const token = await signToken({
				external_id: existingAccount.external_id,
				user_id: existingAccount.user_id,
				provider: 'spotify',
			})

			return redirectWithToken(token, {
				id: user.id,
				email: user.email,
				username: user.username,
				image_url: user.image_url,
			})
		}

		let existingUser = await db.query.users.findFirst({
			where: (users, { eq }) => eq(users.email, spotifyUser.email),
		})

		if (!existingUser) {
			const allowSignup = process.env.ALLOW_SIGNUP === 'true'

			if (!allowSignup) {
				return redirectWithError('User not found. Please contact an administrator to create your account.')
			}

			const [newUser] = await db
				.insert(users)
				.values({
					email: spotifyUser.email,
					username:
						spotifyUser.display_name ||
						spotifyUser.email.split('@')[0],
					image_url: spotifyUser.images?.[0]?.url,
				})
				.returning()

			if (!newUser) {
				return redirectWithError('Failed to create user')
			}

			existingUser = newUser
		}

		const [newAccount] = await db
			.insert(accounts)
			.values({
				user_id: existingUser.id,
				external_id: spotifyUser.id,
				provider: 'spotify',
				access_token: tokenResponse.access_token,
				refresh_token: tokenResponse.refresh_token,
				expires_in: calculateExpiresAt(tokenResponse.expires_in),
				scope: tokenResponse.scope,
			})
			.returning()

		if (!newAccount) {
			return redirectWithError('Failed to create account')
		}

		const updateData: { username?: string; image_url?: string } = {}

		if (!existingUser.username) {
			updateData.username =
				spotifyUser.display_name || spotifyUser.email.split('@')[0]
		}

		if (!existingUser.image_url) {
			updateData.image_url = spotifyUser.images?.[0]?.url
		}

		let updatedUser = existingUser
		if (Object.keys(updateData).length > 0) {
			const [updated] = await db
				.update(users)
				.set(updateData)
				.where(eq(users.id, newAccount.user_id))
				.returning()

			if (!updated) {
				return redirectWithError('Failed to update user')
			}

			updatedUser = updated
		}

		const token = await signToken({
			user_id: updatedUser.id,
			external_id: newAccount.external_id,
			provider: 'spotify',
		})

		return redirectWithToken(token, {
			id: updatedUser.id,
			email: updatedUser.email,
			username: updatedUser.username,
			image_url: updatedUser.image_url,
		})
	} catch (error) {
		console.error('Error exchanging code for token:', error)
		return redirectWithError('Failed to authenticate with Spotify')
	}
})

export default auth
