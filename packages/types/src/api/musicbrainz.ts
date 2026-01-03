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

/**
 * MusicBrainz relationship types
 * @see https://musicbrainz.org/doc/MusicBrainz_API#Relationships
 */

/** Artist relationship from MusicBrainz */
export interface MusicBrainzArtistRelation {
	/** Relationship type (e.g., "member of band", "vocal", "instrument") */
	type: string
	/** Relationship type ID */
	'type-id': string
	/** Direction of the relationship */
	direction: 'forward' | 'backward'
	/** The related artist */
	artist: MusicBrainzArtist
	/** Start date of the relationship (YYYY, YYYY-MM, or YYYY-MM-DD) */
	begin?: string
	/** End date of the relationship */
	end?: string
	/** Whether the relationship has ended */
	ended?: boolean
	/** Additional attributes (e.g., instrument type, vocal type) */
	attributes?: string[]
}

/** Full artist details with relationships */
export interface MusicBrainzArtistDetails {
	id: string
	name: string
	'sort-name'?: string
	type?: 'Person' | 'Group' | 'Orchestra' | 'Choir' | 'Character' | 'Other'
	'type-id'?: string
	/** Gender (only for Person type) */
	gender?: 'Male' | 'Female' | 'Other' | null
	'gender-id'?: string
	country?: string
	/** Artist area (country/city) */
	area?: {
		id: string
		name: string
		type?: string
	}
	/** Begin area (birthplace for person, founding location for group) */
	'begin-area'?: {
		id: string
		name: string
		type?: string
	}
	/** Life span for person, active period for group */
	'life-span'?: {
		begin?: string
		end?: string
		ended?: boolean
	}
	/** Artist relationships (requires inc=artist-rels) */
	relations?: MusicBrainzArtistRelation[]
}

/**
 * Extended types for search results and sync endpoints
 */

/** Artist search result item with additional fields for UI selection */
export interface MusicBrainzArtistSearchResult {
	id: string
	name: string
	'sort-name'?: string
	type?: 'Person' | 'Group' | 'Orchestra' | 'Choir' | 'Character' | 'Other'
	/** Gender (only for Person type) */
	gender?: 'Male' | 'Female' | 'Other' | null
	score?: number
	country?: string
	/** Disambiguation comment to differentiate artists with same name */
	disambiguation?: string
	/** Artist area */
	area?: {
		id: string
		name: string
		type?: string
	}
	/** Life span */
	'life-span'?: {
		begin?: string
		end?: string
		ended?: boolean
	}
}

/** Extended artist search response with full result items */
export interface ArtistSearchResultResponse {
	artists?: MusicBrainzArtistSearchResult[]
	count?: number
	offset?: number
}

/** Release search result item with additional fields for UI selection */
export interface MusicBrainzReleaseSearchResult {
	id: string
	title: string
	score?: number
	date?: string
	status?: string
	country?: string
	/** Disambiguation comment */
	disambiguation?: string
	/** Artist credit for the release */
	'artist-credit'?: MusicBrainzArtistCredit[]
	/** Release group info */
	'release-group'?: {
		id: string
		title?: string
		'primary-type'?: string
		'secondary-types'?: string[]
	}
	/** Label info */
	'label-info'?: Array<{
		'catalog-number'?: string
		label?: {
			id: string
			name: string
		}
	}>
	/** Track count */
	'track-count'?: number
}

/** Extended release search response with full result items */
export interface ReleaseSearchResultResponse {
	releases?: MusicBrainzReleaseSearchResult[]
	count?: number
	offset?: number
}

/** Full release details from lookup endpoint */
export interface MusicBrainzReleaseDetails {
	id: string
	title: string
	date?: string
	status?: string
	country?: string
	disambiguation?: string
	'artist-credit'?: MusicBrainzArtistCredit[]
	'release-group'?: {
		id: string
		title?: string
		'primary-type'?: string
		'secondary-types'?: string[]
	}
	'label-info'?: Array<{
		'catalog-number'?: string
		label?: {
			id: string
			name: string
		}
	}>
}
