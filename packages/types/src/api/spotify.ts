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

/** Spotify artist object from the Get Artist endpoint */
export interface SpotifyArtist {
	id: string
	name: string
	uri: string
	images: Array<{ url: string; width: number; height: number }>
	genres: string[]
	popularity: number
	followers: { total: number }
}

/** Spotify track object (shared between endpoints) */
export interface SpotifyTrack {
	id: string
	uri: string
	name: string
	duration_ms: number
	explicit: boolean
	artists: Array<{ id: string; name: string; uri: string }>
	album: {
		id: string
		name: string
		uri: string
		images?: Array<{ url: string; width?: number; height?: number }>
		release_date?: string
		artists: Array<{ id: string; name: string }>
	}
	external_ids?: { isrc?: string }
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

/**
 * Response from Spotify's currently-playing endpoint
 * @see https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track
 */
export interface CurrentlyPlayingResponse {
	/** Unix timestamp in ms when data was fetched */
	timestamp: number
	/** Progress into the currently playing track in ms */
	progress_ms: number | null
	/** If something is currently playing */
	is_playing: boolean
	/** The currently playing track (null if nothing playing or if it's not a track) */
	item: SpotifyTrack | null
	/** The object type of the currently playing item: 'track', 'episode', 'ad', 'unknown' */
	currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown'
	/** Context from which playback is happening (playlist, album, etc) */
	context: {
		type: string
		uri: string
		href: string
	} | null
}
