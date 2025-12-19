'use client'

import { useTranslation } from 'react-i18next'
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
	colorKey: string
}

function ColorCard({
	name,
	value,
	foregroundValue,
	themeBackground,
	colorKey,
}: ColorCardProps) {
	// For Foreground color card, use background color as text color
	// Otherwise use foregroundValue when available, or white for contrast
	let textColor: string
	if (colorKey === 'foreground' && themeBackground) {
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

function getAllColors(variant: ThemeVariant, t: (key: string) => string) {
	return [
		{ name: t('themePicker.colors.background'), value: variant.background, colorKey: 'background' },
		{ name: t('themePicker.colors.foreground'), value: variant.foreground, colorKey: 'foreground' },
		{
			name: t('themePicker.colors.card'),
			value: variant.card,
			foregroundValue: variant.cardForeground,
			colorKey: 'card',
		},
		{
			name: t('themePicker.colors.popover'),
			value: variant.popover,
			foregroundValue: variant.popoverForeground,
			colorKey: 'popover',
		},
		{
			name: t('themePicker.colors.primary'),
			value: variant.primary,
			foregroundValue: variant.primaryForeground,
			colorKey: 'primary',
		},
		{
			name: t('themePicker.colors.secondary'),
			value: variant.secondary,
			foregroundValue: variant.secondaryForeground,
			colorKey: 'secondary',
		},
		{
			name: t('themePicker.colors.accent'),
			value: variant.accent,
			foregroundValue: variant.accentForeground,
			colorKey: 'accent',
		},
		{
			name: t('themePicker.colors.muted'),
			value: variant.muted,
			foregroundValue: variant.mutedForeground,
			colorKey: 'muted',
		},
		{ name: t('themePicker.colors.destructive'), value: variant.destructive, colorKey: 'destructive' },
		{ name: t('themePicker.colors.border'), value: variant.border, colorKey: 'border' },
		{ name: t('themePicker.colors.input'), value: variant.input, colorKey: 'input' },
		{ name: t('themePicker.colors.ring'), value: variant.ring, colorKey: 'ring' },
		{ name: t('themePicker.colors.chart1'), value: variant.chart1, colorKey: 'chart1' },
		{ name: t('themePicker.colors.chart2'), value: variant.chart2, colorKey: 'chart2' },
		{ name: t('themePicker.colors.chart3'), value: variant.chart3, colorKey: 'chart3' },
		{ name: t('themePicker.colors.chart4'), value: variant.chart4, colorKey: 'chart4' },
		{ name: t('themePicker.colors.chart5'), value: variant.chart5, colorKey: 'chart5' },
		{
			name: t('themePicker.colors.sidebar'),
			value: variant.sidebar,
			foregroundValue: variant.sidebarForeground,
			colorKey: 'sidebar',
		},
		{
			name: t('themePicker.colors.sidebarPrimary'),
			value: variant.sidebarPrimary,
			foregroundValue: variant.sidebarPrimaryForeground,
			colorKey: 'sidebarPrimary',
		},
		{
			name: t('themePicker.colors.sidebarAccent'),
			value: variant.sidebarAccent,
			foregroundValue: variant.sidebarAccentForeground,
			colorKey: 'sidebarAccent',
		},
		{ name: t('themePicker.colors.sidebarBorder'), value: variant.sidebarBorder, colorKey: 'sidebarBorder' },
		{ name: t('themePicker.colors.sidebarRing'), value: variant.sidebarRing, colorKey: 'sidebarRing' },
	]
}

export function ThemePicker() {
	const { t } = useTranslation()
	const { theme, mode, resolvedMode, setTheme, setMode, themes } = useTheme()

	const currentTheme = themes[theme]
	const currentVariant = currentTheme?.[resolvedMode] || currentTheme?.light

	const themeOptions = Object.keys(themes).map((key) => ({
		value: key,
		label: themes[key].name,
	}))

	const allColors = currentVariant ? getAllColors(currentVariant, t) : []

	return (
		<div className="space-y-4 p-6">
			{/* Controls Section */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1 space-y-1.5 min-w-0">
					<label className="text-xs font-medium block">{t('themePicker.labels.theme')}</label>
					<Combobox
						value={theme}
						onValueChange={(value) => {
							if (value) setTheme(value)
						}}
					>
						<ComboboxInput
							placeholder={t('themePicker.placeholders.selectTheme')}
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
					<label className="text-xs font-medium block">{t('themePicker.labels.mode')}</label>
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
							<SelectItem value="light">{t('themePicker.modes.light')}</SelectItem>
							<SelectItem value="dark">{t('themePicker.modes.dark')}</SelectItem>
							<SelectItem value="system">{t('themePicker.modes.system')}</SelectItem>
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
							{currentTheme.description} • {t('themePicker.description.by')}{' '}
							{currentTheme.author} • {t('themePicker.description.mode')}: {resolvedMode}
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
						colorKey={color.colorKey}
					/>
				))}
			</div>
		</div>
	)
}
