import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type {
	ResolvedThemeMode,
	ThemeContextValue,
	ThemeMode,
} from '@/lib/themes/types'
import { themes } from '@/lib/themes/themes'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'theme-preference'

function getSystemMode(): ResolvedThemeMode {
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

function getStoredPreference(): { theme: string; mode: ThemeMode } | null {
	if (typeof window === 'undefined') return null
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored) {
			return JSON.parse(stored)
		}
	} catch {
		// Ignore parse errors
	}
	return null
}

function setStoredPreference(theme: string, mode: ThemeMode): void {
	if (typeof window === 'undefined') return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, mode }))
	} catch {
		// Ignore storage errors
	}
}

function applyTheme(themeName: string, mode: ResolvedThemeMode): void {
	if (typeof document === 'undefined') return

	const theme = themes[themeName]
	if (!theme) return

	const variant = mode === 'dark' ? theme.dark : theme.light
	const root = document.documentElement

	// Apply CSS variables
	root.style.setProperty('--background', variant.background)
	root.style.setProperty('--foreground', variant.foreground)
	root.style.setProperty('--card', variant.card)
	root.style.setProperty('--card-foreground', variant.cardForeground)
	root.style.setProperty('--popover', variant.popover)
	root.style.setProperty('--popover-foreground', variant.popoverForeground)
	root.style.setProperty('--primary', variant.primary)
	root.style.setProperty('--primary-foreground', variant.primaryForeground)
	root.style.setProperty('--secondary', variant.secondary)
	root.style.setProperty(
		'--secondary-foreground',
		variant.secondaryForeground
	)
	root.style.setProperty('--muted', variant.muted)
	root.style.setProperty('--muted-foreground', variant.mutedForeground)
	root.style.setProperty('--accent', variant.accent)
	root.style.setProperty('--accent-foreground', variant.accentForeground)
	root.style.setProperty('--destructive', variant.destructive)
	root.style.setProperty('--border', variant.border)
	root.style.setProperty('--input', variant.input)
	root.style.setProperty('--ring', variant.ring)
	root.style.setProperty('--chart-1', variant.chart1)
	root.style.setProperty('--chart-2', variant.chart2)
	root.style.setProperty('--chart-3', variant.chart3)
	root.style.setProperty('--chart-4', variant.chart4)
	root.style.setProperty('--chart-5', variant.chart5)
	root.style.setProperty('--radius', variant.radius)
	root.style.setProperty('--sidebar', variant.sidebar)
	root.style.setProperty('--sidebar-foreground', variant.sidebarForeground)
	root.style.setProperty('--sidebar-primary', variant.sidebarPrimary)
	root.style.setProperty(
		'--sidebar-primary-foreground',
		variant.sidebarPrimaryForeground
	)
	root.style.setProperty('--sidebar-accent', variant.sidebarAccent)
	root.style.setProperty(
		'--sidebar-accent-foreground',
		variant.sidebarAccentForeground
	)
	root.style.setProperty('--sidebar-border', variant.sidebarBorder)
	root.style.setProperty('--sidebar-ring', variant.sidebarRing)

	// Toggle dark class
	if (mode === 'dark') {
		root.classList.add('dark')
	} else {
		root.classList.remove('dark')
	}
}

interface ThemeProviderProps {
	children: React.ReactNode
	defaultTheme?: string
	defaultMode?: ThemeMode
	storageKey?: string
}

export function ThemeProvider({
	children,
	defaultTheme = 'default',
	defaultMode = 'system',
}: ThemeProviderProps) {
	const stored = getStoredPreference()
	const [theme, setThemeState] = useState<string>(
		stored?.theme ?? defaultTheme
	)
	const [mode, setModeState] = useState<ThemeMode>(
		stored?.mode ?? defaultMode
	)

	const resolvedMode: ResolvedThemeMode = useMemo(() => {
		if (mode === 'system') {
			return getSystemMode()
		}
		return mode
	}, [mode])

	// Apply theme when theme or mode changes
	useEffect(() => {
		applyTheme(theme, resolvedMode)
	}, [theme, resolvedMode])

	// Listen for system preference changes when mode is "system"
	useEffect(() => {
		if (mode !== 'system') return

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		const handleChange = () => {
			applyTheme(theme, getSystemMode())
		}

		mediaQuery.addEventListener('change', handleChange)
		return () => mediaQuery.removeEventListener('change', handleChange)
	}, [mode, theme])

	// Persist to localStorage
	useEffect(() => {
		setStoredPreference(theme, mode)
	}, [theme, mode])

	const setTheme = (newTheme: string) => {
		if (themes[newTheme]) {
			setThemeState(newTheme)
		}
	}

	const setMode = (newMode: ThemeMode) => {
		setModeState(newMode)
	}

	const value: ThemeContextValue = {
		theme,
		mode,
		resolvedMode,
		setTheme,
		setMode,
		themes,
	}

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	)
}

export function useThemeContext(): ThemeContextValue {
	const context = useContext(ThemeContext)
	if (context === undefined) {
		throw new Error('useThemeContext must be used within a ThemeProvider')
	}
	return context
}
