'use client'

import { useTranslation } from 'react-i18next'
import { useTheme } from '@/hooks/use-theme'
import { Palette, Sun, Moon, Monitor, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ThemeSelectorModalProps {
	children?: React.ReactNode
}

export function ThemeSelectorModal({ children }: ThemeSelectorModalProps) {
	const { t } = useTranslation()
	const { theme, mode, resolvedMode, setTheme, setMode, themes } = useTheme()

	const themeOptions = Object.keys(themes).map((key) => ({
		value: key,
		label: themes[key].name,
		description: themes[key].description,
	}))

	const modeOptions = [
		{
			value: 'light' as const,
			label: t('themePicker.modes.light'),
			icon: Sun,
		},
		{
			value: 'dark' as const,
			label: t('themePicker.modes.dark'),
			icon: Moon,
		},
		{
			value: 'system' as const,
			label: t('themePicker.modes.system'),
			icon: Monitor,
		},
	]

	return (
		<Dialog>
			<DialogTrigger asChild>
				{children ?? (
					<Button className="hover:cursor-pointer" variant="ghost" size="icon">
						<Palette className="size-4" />
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-w-sm">
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-2 top-2 size-7 hover:cursor-pointer"
					>
						<X className="size-4" />
						<span className="sr-only">Close</span>
					</Button>
				</DialogClose>
				<DialogHeader>
					<DialogTitle>{t('themePicker.labels.theme')}</DialogTitle>
					<DialogDescription>
						{t(
							'themePicker.description.customize',
							'Customize the appearance of your dashboard'
						)}
					</DialogDescription>
				</DialogHeader>

				{/* Theme Selection */}
				<div className="space-y-2">
					<label className="text-xs font-medium text-muted-foreground">
						{t('themePicker.labels.theme')}
					</label>
					<div className="grid grid-cols-2 gap-2">
						{themeOptions.map((option) => {
							const themeData = themes[option.value]
							const variant = themeData[resolvedMode]
							const isSelected = theme === option.value

							return (
								<button
									key={option.value}
									onClick={() => setTheme(option.value)}
									className={cn(
										'relative flex flex-col items-start gap-1 p-3 text-left transition-colors ring-1 ring-border hover:bg-muted/50',
										isSelected && 'ring-2 ring-foreground'
									)}
								>
									{/* Color preview */}
									<div className="flex gap-1 mb-1">
										<div
											className="size-4 ring-1 ring-border/50"
											style={{
												backgroundColor:
													variant.primary,
											}}
										/>
										<div
											className="size-4 ring-1 ring-border/50"
											style={{
												backgroundColor:
													variant.secondary,
											}}
										/>
										<div
											className="size-4 ring-1 ring-border/50"
											style={{
												backgroundColor: variant.accent,
											}}
										/>
									</div>
									<span className="text-xs font-medium">
										{option.label}
									</span>
									{isSelected && (
										<Check className="absolute top-2 right-2 size-3 text-foreground" />
									)}
								</button>
							)
						})}
					</div>
				</div>

				{/* Mode Selection */}
				<div className="space-y-2">
					<label className="text-xs font-medium text-muted-foreground">
						{t('themePicker.labels.mode')}
					</label>
					<div className="grid grid-cols-3 gap-2">
						{modeOptions.map((option) => {
							const Icon = option.icon
							const isSelected = mode === option.value

							return (
								<button
									key={option.value}
									onClick={() => setMode(option.value)}
									className={cn(
										'flex flex-col items-center gap-1.5 p-3 transition-colors ring-1 ring-border hover:bg-muted/50',
										isSelected &&
											'ring-2 ring-foreground bg-muted/30'
									)}
								>
									<Icon className="size-4" />
									<span className="text-xs">
										{option.label}
									</span>
								</button>
							)
						})}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
