import { Context, Next } from "hono";
import { verifyToken } from "../lib/jwt";
import { db } from "../db";

export const authenticate = async (ctx: Context, next: Next) => {
    const authHeader = ctx.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);

    if (!payload) {
        return ctx.json({ error: 'Invalid or expired token' }, 401);
    }
    
    try {
        const account = await db.query.accounts.findFirst({
            where: (accounts, { eq, and }) =>
                and(
                    eq(accounts.provider, 'spotify'),
                    eq(accounts.external_id, payload.external_id),
                ),
        });

        if (!account || !account.user_id) {
            return ctx.json({ error: 'Account not found' }, 404);
        }

        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, account.user_id),
        });

        if (!user) {
            return ctx.json({ error: 'User not found' }, 404);
        }

        ctx.set('account', account);
        ctx.set('user', user);
        
        await next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return ctx.json({ error: 'Authentication failed' }, 500);
    }
}