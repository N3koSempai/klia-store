import { createTheme } from "@mui/material/styles";
import type { AccessibilityPrefs, ColorBlindMode } from "../store/accessibilityStore";

import IBMPlexSansVariable from "../assets/fonts/IBMPlexSans-VariableFont_wdth,wght.ttf";

// Color palettes per color-blind mode
// Each palette replaces primary/secondary/error with perceptually distinct hues
const colorBlindPalettes: Record<
	ColorBlindMode,
	{ primary: string; secondary: string; error: string; info: string }
> = {
	none: {
		primary: "#4A86CF",
		secondary: "#F6D32D",
		error: "#FF6B6B",
		info: "#58A6FF",
	},
	// Deuteranopia (red-green, most common ~6% males): avoid red/green distinction
	// Use blue + orange + magenta instead
	deuteranopia: {
		primary: "#4A86CF",
		secondary: "#E07B39",
		error: "#C44DC4",
		info: "#58A6FF",
	},
	// Protanopia (red-blind): reds appear dark/absent — use blue + yellow + violet
	protanopia: {
		primary: "#4A86CF",
		secondary: "#F0D43A",
		error: "#8B6EF5",
		info: "#58A6FF",
	},
	// Tritanopia (blue-yellow blind, rare): avoid blue/yellow — use teal + red + orange
	tritanopia: {
		primary: "#2BB5A0",
		secondary: "#E07840",
		error: "#E05C5C",
		info: "#2BB5A0",
	},
};

// High-contrast text overrides (WCAG AAA — 7:1 ratio on #0D1117)
const highContrastText = {
	primary: "#FFFFFF",
	secondary: "#C0CFDF",
};

const normalText = {
	primary: "#C9D1D9",
	secondary: "#9CAAB6", // bumped from #8B949E to meet 4.5:1 AA
};

export function createAppTheme(prefs?: Partial<AccessibilityPrefs>) {
	const mode = prefs?.colorBlindMode ?? "none";
	const hiContrast = prefs?.highContrast ?? false;
	const palette = colorBlindPalettes[mode];
	const text = hiContrast ? highContrastText : normalText;

	return createTheme({
		palette: {
			mode: "dark",
			primary: { main: palette.primary },
			secondary: { main: palette.secondary },
			error: { main: palette.error },
			info: { main: palette.info },
			background: {
				default: "#0D1117",
				paper: hiContrast ? "#1C2333" : "#161B22",
			},
			text,
		},
		typography: {
			fontFamily: '"IBM Plex Sans", "Roboto", "Helvetica", "Arial", sans-serif',
		},
		components: {
			MuiCssBaseline: {
				styleOverrides: `
					@font-face {
						font-family: 'IBM Plex Sans';
						font-style: normal;
						font-display: swap;
						font-weight: 100 700;
						font-stretch: 75% 125%;
						src: url(${IBMPlexSansVariable}) format('truetype-variations');
					}

					body {
						backgroundColor: #0D1117;
					}

					.skip-to-content {
						position: fixed;
						top: -100%;
						left: 50%;
						transform: translateX(-50%);
						z-index: 99999;
						padding: 8px 20px;
						background: ${palette.primary};
						color: #fff;
						font-weight: 700;
						border-radius: 0 0 8px 8px;
						text-decoration: none;
						transition: top 0.15s;
					}
					.skip-to-content:focus {
						top: 40px;
						outline: 3px solid ${palette.secondary};
						outline-offset: 2px;
					}
				`,
			},
			MuiButtonBase: {
				styleOverrides: {
					root: {
						"&:focus-visible": {
							outline: `2px solid ${palette.primary}`,
							outlineOffset: "2px",
						},
					},
				},
			},
		},
	});
}

// Default theme (no prefs) — used as fallback before store hydrates
export const theme = createAppTheme();
