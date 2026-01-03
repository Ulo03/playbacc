/**
 * MusicBrainz API type definitions
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

/** Basic MusicBrainz recording reference */
export interface MusicBrainzRecording {
	id: string
	title?: string
}

/** Basic MusicBrainz artist reference */
export interface MusicBrainzArtist {
	id: string
	name?: string
	'sort-name'?: string
}

/** Basic MusicBrainz release reference */
export interface MusicBrainzRelease {
	id: string
	title?: string
	date?: string
	status?: string
	'release-group'?: {
		id: string
		title?: string
		'primary-type'?: string
	}
}

/** Artist credit entry from MusicBrainz */
export interface MusicBrainzArtistCredit {
	artist: MusicBrainzArtist
	name?: string
	joinphrase?: string
}

/** Full recording details from MusicBrainz lookup */
export interface MusicBrainzRecordingDetails {
	id: string
	title: string
	length?: number
	'first-release-date'?: string
	isrcs?: string[]
	'artist-credit'?: MusicBrainzArtistCredit[]
	releases?: MusicBrainzRelease[]
}

/** Response from ISRC lookup endpoint */
export interface IsrcLookupResponse {
	recordings?: MusicBrainzRecording[]
}

/** Response from artist search endpoint */
export interface ArtistSearchResponse {
	artists?: MusicBrainzArtist[]
	count?: number
	offset?: number
}

/** Response from release search endpoint */
export interface ReleaseSearchResponse {
	releases?: MusicBrainzRelease[]
	count?: number
	offset?: number
}

/** Recording search result item */
export interface MusicBrainzRecordingSearchResult {
	id: string
	title: string
	score?: number
	length?: number
	'first-release-date'?: string
	'artist-credit'?: MusicBrainzArtistCredit[]
	releases?: MusicBrainzRelease[]
}

/** Response from recording search endpoint */
export interface RecordingSearchResponse {
	recordings?: MusicBrainzRecordingSearchResult[]
	count?: number
	offset?: number
}
