import defaultTheme from './default'
import blueTheme from './blue'
import greenTheme from './green'
import purpleTheme from './purple'
import type { Theme } from './types'


export const themes: Record<string, Theme> = {
	default: defaultTheme,
	blue: blueTheme,
	green: greenTheme,
	purple: purpleTheme,
}
