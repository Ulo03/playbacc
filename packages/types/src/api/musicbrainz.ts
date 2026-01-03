export interface MusicBrainzRecording {
	id: string
	title?: string
}

export interface MusicBrainzArtist {
	id: string
	name?: string
}

export interface MusicBrainzRelease {
	id: string
	title?: string
}

export interface IsrcLookupResponse {
	recordings?: MusicBrainzRecording[]
}

export interface ArtistSearchResponse {
	artists?: MusicBrainzArtist[]
}

export interface ReleaseSearchResponse {
	releases?: MusicBrainzRelease[]
}

