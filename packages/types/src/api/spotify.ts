export interface TokenResponse {
	access_token: string
	refresh_token?: string
	expires_in: number
	scope?: string
	token_type: string
}

export interface SpotifyUser {
	id: string
	email: string
	display_name: string
	images?: Array<{ url: string }>
}

export interface RecentlyPlayedItem {
	track: {
		id: string
		name: string
		duration_ms: number
		explicit: boolean
		artists: Array<{ id: string; name: string }>
		album: {
			id: string
			name: string
			images?: Array<{ url: string }>
			release_date?: string
			artists: Array<{ id: string; name: string }>
		}
		external_ids?: { isrc?: string }
	}
	played_at: string
}

export interface RecentlyPlayedResponse {
	items: Array<RecentlyPlayedItem>
	next: string | null
	cursors: {
		after: string
		before: string
	}
	limit: number
}

