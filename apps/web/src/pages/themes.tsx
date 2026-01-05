import { useNavigate } from '@tanstack/react-router'
import { ThemePicker } from '@/components/theme-picker'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export function ThemesPage() {
	const navigate = useNavigate()

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="border-b border-border">
				<div className="container mx-auto px-4 h-14 flex items-center gap-4">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate({ to: '/' })}
					>
						<ArrowLeft className="size-4" />
					</Button>
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 bg-foreground/5 border border-border flex items-center justify-center">
							<svg
								className="w-4 h-4 text-foreground"
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
						<span className="font-semibold text-sm">playbacc</span>
					</div>
				</div>
			</header>

			{/* Main content */}
			<main className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-2xl font-bold tracking-tight mb-1">Themes</h1>
					<p className="text-muted-foreground text-sm">
						Customize the appearance of your dashboard
					</p>
				</div>

				<ThemePicker />
			</main>
		</div>
	)
}
