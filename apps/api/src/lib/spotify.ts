import type {
	RecentlyPlayedResponse,
	SpotifyUser,
	TokenResponse,
} from '@playbacc/types/api/spotify'

export type {
	RecentlyPlayedItem,
	RecentlyPlayedResponse,
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

export const exchangeCodeForToken = async (code: string) => {
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

export const refreshAccessToken = async (refreshToken: string) => {
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
		throw new Error('Failed to refresh access token')
	}

	return response.json() as Promise<TokenResponse>
}

export const getUserProfile = async (accessToken: string) => {
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

export const getRecentlyPlayedTracks = async (
	accessToken: string,
	options?: { limit?: number; before?: string; after?: string }
) => {
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
		throw new Error('Failed to get recently played tracks')
	}

	return response.json() as Promise<RecentlyPlayedResponse>
}
