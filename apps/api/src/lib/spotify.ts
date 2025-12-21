const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    throw new Error('Missing required Spotify environment variables.');
}

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type: string;
}

export interface SpotifyUser {
    id: string;
    email: string;
    display_name: string;
    images?: Array<{ url: string }>;
}

export const getAuthUrl = (state?: string, scope?: string[]) => {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        ...(state && { state }),
        ...(scope && { scope: scope.join(' ') }),
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export const exchangeCodeForToken = async (code: string) => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to exchange code for token');
    }

    return response.json() as Promise<TokenResponse>;
}

export const refreshAccessToken = async (refreshToken: string) => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: SPOTIFY_CLIENT_ID,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to refresh access token');
    }

    return response.json() as Promise<TokenResponse>;
}

export const getUserProfile = async (accessToken: string) => {
    const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to get user profile');
    }

    return response.json() as Promise<SpotifyUser>;
}