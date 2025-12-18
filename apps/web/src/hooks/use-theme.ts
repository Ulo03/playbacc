import { useThemeContext } from '@/components/theme-provider'
import type { ThemeMode } from '@/lib/themes/types'

export function useTheme() {
	const context = useThemeContext()

	return {
		theme: context.theme,
		mode: context.mode,
		resolvedMode: context.resolvedMode,
		setTheme: context.setTheme,
		setMode: context.setMode,
		themes: context.themes,
	}
}

export type { ThemeMode }
