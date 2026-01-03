/**
 * Spotify API client
 *
 * Handles OAuth token exchange, refresh, and API calls to Spotify.
 * Token expiry is stored as an absolute epoch timestamp for reliable checking.
 */

import type {
	CurrentlyPlayingResponse,
	RecentlyPlayedResponse,
	SpotifyUser,
	TokenResponse,
} from '@playbacc/types/api/spotify'

export type {
	CurrentlyPlayingResponse,
	RecentlyPlayedItem,
	RecentlyPlayedResponse,
	SpotifyTrack,
	SpotifyUser,
	TokenResponse,
} from '@playbacc/types/api/spotify'

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1'

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
	throw new Error('Missing required Spotify environment variables.')
}

/** Safety margin in seconds to refresh tokens before they actually expire */
const TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 60

/**
 * Account data structure matching the DB schema
 */
export interface SpotifyAccount {
	id: string
	user_id: string
	provider: 'spotify'
	external_id: string
	access_token: string | null
	refresh_token: string | null
	/** Stored as absolute epoch seconds (expires_at), not relative duration */
	expires_in: number | null
	scope: string | null
}

/**
 * Generates the Spotify OAuth authorization URL
 *
 * @param state - Optional state parameter for CSRF protection
 * @param scope - Optional array of permission scopes to request
 * @returns The full authorization URL
 */
export const getAuthUrl = (state?: string, scope?: string[]) => {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: SPOTIFY_CLIENT_ID,
		redirect_uri: SPOTIFY_REDIRECT_URI,
		...(state && { state }),
		...(scope && { scope: scope.join(' ') }),
	})

	return `https://accounts.spotify.com/authorize?${params.toString()}`
}

/**
 * Exchanges an authorization code for access and refresh tokens
 *
 * @param code - The authorization code from the OAuth callback
 * @returns Token response from Spotify
 * @throws Error if the exchange fails
 */
export const exchangeCodeForToken = async (
	code: string
): Promise<TokenResponse> => {
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: SPOTIFY_REDIRECT_URI,
		}),
	})

	if (!response.ok) {
		throw new Error('Failed to exchange code for token')
	}

	return response.json() as Promise<TokenResponse>
}

/**
 * Refreshes an access token using a refresh token
 *
 * @param refreshToken - The refresh token to use
 * @returns Token response with new access token
 * @throws Error if the refresh fails
 */
export const refreshAccessToken = async (
	refreshToken: string
): Promise<TokenResponse> => {
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: SPOTIFY_CLIENT_ID,
		}),
	})

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(`Failed to refresh access token: ${errorText}`)
	}

	return response.json() as Promise<TokenResponse>
}

/**
 * Converts Spotify's relative expires_in to an absolute epoch timestamp
 *
 * @param expiresIn - Token lifetime in seconds from Spotify
 * @returns Absolute epoch seconds when the token will expire
 */
export function calculateExpiresAt(expiresIn: number): number {
	return Math.floor(Date.now() / 1000) + expiresIn
}

/**
 * Checks if an access token is expired or about to expire
 *
 * @param expiresAt - Absolute epoch seconds when token expires (stored as expires_in in DB)
 * @returns True if the token needs to be refreshed
 */
export function isTokenExpired(expiresAt: number | null): boolean {
	if (expiresAt === null) {
		return true
	}
	const nowEpochSeconds = Math.floor(Date.now() / 1000)
	return expiresAt < nowEpochSeconds + TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS
}

/**
 * Gets a valid access token for an account, refreshing if necessary.
 * This is used by the scrobble worker to ensure tokens are fresh.
 *
 * @param account - The Spotify account from the database
 * @param updateTokenCallback - Callback to persist new token data to DB
 * @returns Valid access token or null if unable to obtain one
 */
export async function getValidAccessToken(
	account: SpotifyAccount,
	updateTokenCallback: (data: {
		access_token: string
		refresh_token: string | null
		expires_in: number
	}) => Promise<void>
): Promise<string | null> {
	// If we have a valid, non-expired token, use it
	if (account.access_token && !isTokenExpired(account.expires_in)) {
		return account.access_token
	}

	// If we have a refresh token, try to refresh
	if (account.refresh_token) {
		try {
			const tokenResponse = await refreshAccessToken(
				account.refresh_token
			)
			const expiresAt = calculateExpiresAt(tokenResponse.expires_in)

			// Persist the new tokens
			await updateTokenCallback({
				access_token: tokenResponse.access_token,
				refresh_token:
					tokenResponse.refresh_token ?? account.refresh_token,
				expires_in: expiresAt,
			})

			return tokenResponse.access_token
		} catch (error) {
			console.error(
				`[Spotify] Failed to refresh token for account ${account.id}:`,
				error
			)
			return null
		}
	}

	// No valid token and no refresh token
	console.warn(
		`[Spotify] Account ${account.id} has no valid token and no refresh token`
	)
	return null
}

/**
 * Gets the current user's Spotify profile
 *
 * @param accessToken - Valid access token
 * @returns Spotify user profile
 * @throws Error if the request fails
 */
export const getUserProfile = async (
	accessToken: string
): Promise<SpotifyUser> => {
	const response = await fetch(`${SPOTIFY_API_BASE_URL}/me`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	})

	if (!response.ok) {
		throw new Error('Failed to get user profile')
	}

	return response.json() as Promise<SpotifyUser>
}

/**
 * Gets the user's recently played tracks from Spotify.
 *
 * Note: Spotify only returns the last 50 tracks regardless of how far back you query.
 * The `after` parameter is a Unix timestamp in milliseconds.
 *
 * @param accessToken - Valid access token
 * @param options - Pagination options
 * @param options.limit - Maximum items to return (1-50, default 20)
 * @param options.before - Return items before this Unix timestamp (ms)
 * @param options.after - Return items after this Unix timestamp (ms)
 * @returns Recently played response with tracks and cursors
 * @throws Error if the request fails
 */
export const getRecentlyPlayedTracks = async (
	accessToken: string,
	options?: { limit?: number; before?: string; after?: string }
): Promise<RecentlyPlayedResponse> => {
	const url = new URL(`${SPOTIFY_API_BASE_URL}/me/player/recently-played`)

	if (options?.limit) {
		url.searchParams.set('limit', options.limit.toString())
	}
	if (options?.before) {
		url.searchParams.set('before', options.before)
	}
	if (options?.after) {
		url.searchParams.set('after', options.after)
	}

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	})

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(`Failed to get recently played tracks: ${errorText}`)
	}

	return response.json() as Promise<RecentlyPlayedResponse>
}

/**
 * Gets the user's currently playing track from Spotify.
 *
 * Requires scopes: user-read-currently-playing, user-read-playback-state
 *
 * @param accessToken - Valid access token
 * @returns Currently playing response, or null if nothing is playing
 */
export const getCurrentlyPlaying = async (
	accessToken: string
): Promise<CurrentlyPlayingResponse | null> => {
	const response = await fetch(
		`${SPOTIFY_API_BASE_URL}/me/player/currently-playing`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		}
	)

	// 204 No Content means nothing is playing
	if (response.status === 204) {
		return null
	}

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(`Failed to get currently playing: ${errorText}`)
	}

	const data = (await response.json()) as CurrentlyPlayingResponse

	// Only return if it's a track (not episode, ad, etc.)
	if (data.currently_playing_type !== 'track' || !data.item) {
		return null
	}

	return data
}
