import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import syncRoutes from './routes/sync'
import playerRoutes from './routes/player'
import statsRoutes from './routes/stats'

const app = new Hono()

app.use(
	'*',
	cors({
		origin: process.env.FRONTEND_URL || 'http://localhost:5173',
		credentials: true,
	})
)

app.get('/', (ctx) => {
	return ctx.json({
		message: 'Playbacc API',
		version: '0.0.0',
	})
})

app.route('/api/auth', authRoutes)
app.route('/api/sync', syncRoutes)
app.route('/api/player', playerRoutes)
app.route('/api/stats', statsRoutes)

export default app
