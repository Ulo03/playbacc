import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import spotifyLogo from '@/assets/spotify_black.png'

export function LoginPage() {
	const { login } = useAuth()

	const handleLogin = async () => {
		try {
			await login()
		} catch {
			console.error('Login failed')
		}
	}

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
			{/* Animated background */}
			<div className="absolute inset-0 overflow-hidden">
				<div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] bg-[#1DB954]/5 rounded-full blur-3xl animate-pulse" />
				<div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] bg-[#1DB954]/3 rounded-full blur-3xl animate-pulse delay-1000" />
				{/* Grid pattern */}
				<div 
					className="absolute inset-0 opacity-[0.02]"
					style={{
						backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
							linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
						backgroundSize: '64px 64px'
					}}
				/>
			</div>

			<div className="relative z-10 w-full max-w-md">
				{/* Logo and branding */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-foreground/5 border border-border mb-6">
						<svg
							className="w-8 h-8 text-foreground"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<path d="M9 18V5l12-2v13" />
							<circle cx="6" cy="18" r="3" />
							<circle cx="18" cy="16" r="3" />
						</svg>
					</div>
					<h1 className="text-3xl font-bold tracking-tight mb-2">playbacc</h1>
					<p className="text-muted-foreground text-sm">
						Track your listening history across platforms
					</p>
				</div>

				<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
					<CardContent className="pt-4">
						<Button
							onClick={handleLogin}
							className="w-full h-12 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold gap-3 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:cursor-pointer"
						>
							<img src={spotifyLogo} alt="Spotify" className="size-5" />
							Continue with Spotify
						</Button>

						<div className="mt-6 pt-6 border-t border-border/50">
							<p className="text-xs text-muted-foreground text-center leading-relaxed">
								By continuing, you agree to let playbacc access your Spotify
								listening history and currently playing track.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
