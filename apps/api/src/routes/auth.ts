import { Hono } from "hono";
import { exchangeCodeForToken, getAuthUrl, getUserProfile } from "../lib/spotify";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import { accounts, users } from '@playbacc/types/db/schema';
import { authenticate } from "../middleware/auth";

const auth = new Hono();

auth.get('/spotify/login', async (ctx) => {
    const scope = ['user-read-private', 'user-read-email'];
    const authUrl = getAuthUrl(undefined, scope);

    return ctx.json({ url: authUrl });
});

auth.get('/spotify/callback', async (ctx) => {
    const code = ctx.req.query('code');
    const error = ctx.req.query('error');

    if (error) {
        return ctx.json({ error: error }, 400);
    }

    if (!code) {
        return ctx.json({ error: 'Missing code' }, 400);
    }

    try {
        const tokenResponse = await exchangeCodeForToken(code);
        const spotifyUser = await getUserProfile(tokenResponse.access_token)

        const existingAccount = await db.query.accounts.findFirst({
            where: (accounts, { eq, and }) =>
                and(
                    eq(accounts.external_id, spotifyUser.id),
                    eq(accounts.provider, "spotify")
                ),
        });

        if (existingAccount && existingAccount.user_id) {
            const user = await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.id, existingAccount.user_id),
            });

            if (!user) {
                return ctx.json({ error: 'User not found' }, 404);
            }

            await db.update(accounts)
                .set({
                    access_token: tokenResponse.access_token,
                    refresh_token: tokenResponse.refresh_token || existingAccount.refresh_token,
                    expires_in: tokenResponse.expires_in,
                    scope: tokenResponse.scope,
                })
                .where(eq(accounts.external_id, spotifyUser.id));

            const token = await signToken({
                external_id: existingAccount.external_id,
                user_id: existingAccount.user_id,
                provider: "spotify",
            });

            return ctx.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    image_url: user.image_url,
                },
            });
        }

        let existingUser = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, spotifyUser.email),
        });

        if (!existingUser) {
            const allowSignup = process.env.ALLOW_SIGNUP === 'true';
            
            if (!allowSignup) {
                return ctx.json({ error: 'User not found. Please contact an administrator to create your account.' }, 404);
            }
            
            const [newUser] = await db.insert(users).values({
                email: spotifyUser.email,
                username: spotifyUser.display_name || spotifyUser.email.split('@')[0],
                image_url: spotifyUser.images?.[0]?.url,
            }).returning();
            
            if (!newUser) {
                return ctx.json({ error: 'Failed to create user' }, 500);
            }
            
            existingUser = newUser;
        }

        const [newAccount] = await db.insert(accounts).values({
            user_id: existingUser.id,
            external_id: spotifyUser.id,
            provider: 'spotify',
            access_token: tokenResponse.access_token,
            refresh_token: tokenResponse.refresh_token,
            expires_in: tokenResponse.expires_in,
            scope: tokenResponse.scope,
        }).returning();

        if (!newAccount) {
            return ctx.json({ error: 'Failed to create account' }, 500);
        }

        const updateData: { username?: string; image_url?: string } = {};
        
        if (!existingUser.username) {
            updateData.username = spotifyUser.display_name || spotifyUser.email.split('@')[0];
        }
        
        if (!existingUser.image_url) {
            updateData.image_url = spotifyUser.images?.[0]?.url;
        }

        let updatedUser = existingUser;
        if (Object.keys(updateData).length > 0) {
            const [updated] = await db.update(users)
                .set(updateData)
                .where(eq(users.id, newAccount.user_id)).returning();

            if (!updated) {
                return ctx.json({ error: 'Failed to update user' }, 500);
            }
            
            updatedUser = updated;
        }

        const token = await signToken({
            user_id: updatedUser.id,
            external_id: newAccount.external_id,
            provider: 'spotify',
        });

        return ctx.json({
            token,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                username: updatedUser.username,
                image_url: updatedUser.image_url,
            },
        });
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        return ctx.json({ error: 'Failed to exchange code for token' }, 500);
    }
        
});

export default auth;