'use client'

import { useTheme } from '@/hooks/use-theme'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Combobox,
	ComboboxInput,
	ComboboxContent,
	ComboboxList,
	ComboboxItem,
} from '@/components/ui/combobox'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { ThemeVariant } from '@/lib/themes/types'

interface ColorCardProps {
	name: string
	value: string
	foregroundValue?: string
	themeBackground?: string
}

function ColorCard({
	name,
	value,
	foregroundValue,
	themeBackground,
}: ColorCardProps) {
	// For Foreground color card, use background color as text color
	// Otherwise use foregroundValue when available, or white for contrast
	let textColor: string
	if (name === 'Foreground' && themeBackground) {
		textColor = themeBackground
	} else {
		textColor = foregroundValue || 'white'
	}

	return (
		<Card
			size="sm"
			style={{ backgroundColor: value }}
			className="border-border"
		>
			<CardHeader className="pb-2">
				<CardTitle
					className="text-xs font-medium"
					style={{ color: textColor }}
				>
					{name}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1.5 pt-0">
				<div className="space-y-0.5">
					<p
						className="text-[10px] font-mono break-all leading-tight opacity-90"
						style={{ color: textColor }}
					>
						{value}
					</p>
					{foregroundValue && (
						<p
							className="text-[10px] font-mono break-all leading-tight opacity-90"
							style={{ color: textColor }}
						>
							{foregroundValue}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

function getAllColors(variant: ThemeVariant) {
	return [
		{ name: 'Background', value: variant.background },
		{ name: 'Foreground', value: variant.foreground },
		{
			name: 'Card',
			value: variant.card,
			foregroundValue: variant.cardForeground,
		},
		{
			name: 'Popover',
			value: variant.popover,
			foregroundValue: variant.popoverForeground,
		},
		{
			name: 'Primary',
			value: variant.primary,
			foregroundValue: variant.primaryForeground,
		},
		{
			name: 'Secondary',
			value: variant.secondary,
			foregroundValue: variant.secondaryForeground,
		},
		{
			name: 'Accent',
			value: variant.accent,
			foregroundValue: variant.accentForeground,
		},
		{
			name: 'Muted',
			value: variant.muted,
			foregroundValue: variant.mutedForeground,
		},
		{ name: 'Destructive', value: variant.destructive },
		{ name: 'Border', value: variant.border },
		{ name: 'Input', value: variant.input },
		{ name: 'Ring', value: variant.ring },
		{ name: 'Chart 1', value: variant.chart1 },
		{ name: 'Chart 2', value: variant.chart2 },
		{ name: 'Chart 3', value: variant.chart3 },
		{ name: 'Chart 4', value: variant.chart4 },
		{ name: 'Chart 5', value: variant.chart5 },
		{
			name: 'Sidebar',
			value: variant.sidebar,
			foregroundValue: variant.sidebarForeground,
		},
		{
			name: 'Sidebar Primary',
			value: variant.sidebarPrimary,
			foregroundValue: variant.sidebarPrimaryForeground,
		},
		{
			name: 'Sidebar Accent',
			value: variant.sidebarAccent,
			foregroundValue: variant.sidebarAccentForeground,
		},
		{ name: 'Sidebar Border', value: variant.sidebarBorder },
		{ name: 'Sidebar Ring', value: variant.sidebarRing },
	]
}

export function ThemePicker() {
	const { theme, mode, resolvedMode, setTheme, setMode, themes } = useTheme()

	const currentTheme = themes[theme]
	const currentVariant = currentTheme?.[resolvedMode] || currentTheme?.light

	const themeOptions = Object.keys(themes).map((key) => ({
		value: key,
		label: themes[key].name,
	}))

	const allColors = currentVariant ? getAllColors(currentVariant) : []

	return (
		<div className="space-y-4 p-6">
			{/* Controls Section */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1 space-y-1.5 min-w-0">
					<label className="text-xs font-medium block">Theme</label>
					<Combobox
						value={theme}
						onValueChange={(value) => {
							if (value) setTheme(value)
						}}
					>
						<ComboboxInput
							placeholder="Select theme..."
							showClear={false}
							value={currentTheme?.name || theme}
							onChange={(e) => {
								// Prevent manual editing, only allow selection from dropdown
								e.preventDefault()
							}}
							readOnly
						/>
						<ComboboxContent>
							<ComboboxList>
								{themeOptions.map((option) => (
									<ComboboxItem
										key={option.value}
										value={option.value}
									>
										{option.label}
									</ComboboxItem>
								))}
							</ComboboxList>
						</ComboboxContent>
					</Combobox>
				</div>

				<div className="flex-1 space-y-1.5 min-w-0 sm:max-w-[200px]">
					<label className="text-xs font-medium block">Mode</label>
					<Select
						value={mode}
						onValueChange={(value) =>
							setMode(value as 'light' | 'dark' | 'system')
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="light">Light</SelectItem>
							<SelectItem value="dark">Dark</SelectItem>
							<SelectItem value="system">System</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Theme Info */}
			{currentTheme && (
				<Card>
					<CardHeader>
						<CardTitle>{currentTheme.name}</CardTitle>
						<CardDescription>
							{currentTheme.description} • By{' '}
							{currentTheme.author} • Mode: {resolvedMode}
						</CardDescription>
					</CardHeader>
				</Card>
			)}

			{/* Color Display */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
				{allColors.map((color) => (
					<ColorCard
						key={color.name}
						name={color.name}
						value={color.value}
						foregroundValue={color.foregroundValue}
						themeBackground={currentVariant?.background}
					/>
				))}
			</div>
		</div>
	)
}
