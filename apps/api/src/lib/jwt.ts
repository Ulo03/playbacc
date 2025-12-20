import * as jose from 'jose';

const JWT_SECRET = process.env.JWT_SECRET ? new TextEncoder().encode(process.env.JWT_SECRET) : null;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
}

export interface JWTPayload {
    user_id: string;
    external_id: string;
    provider: 'spotify';
}

export const signToken = async (payload: JWTPayload) => {
    const jwt = await new jose.SignJWT({ payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(JWT_SECRET);

    return jwt;
}

export const verifyToken = async (token: string) => {
    try {
        const { payload } = await jose.jwtVerify<JWTPayload>(token, JWT_SECRET);
        return payload;
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}