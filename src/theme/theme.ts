import { alpha, createTheme } from "@mui/material/styles";
import IBMPlexSansVariable from "../assets/fonts/IBMPlexSans-Variable.woff2";
import type {
	AccessibilityPrefs,
	ColorBlindMode,
} from "../store/accessibilityStore";
import {
	controlHeight,
	createSemanticTokens,
	neutral,
	radius,
	status,
} from "./tokens";

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

export function createAppTheme(prefs?: Partial<AccessibilityPrefs>) {
	const mode = prefs?.colorBlindMode ?? "none";
	const hiContrast = prefs?.highContrast ?? false;
	const palette = colorBlindPalettes[mode];
	const tokens = createSemanticTokens({
		highContrast: hiContrast,
		accent: palette.primary,
	});

	// Botón: misma forma, tipografía y sombra en todas las jerarquías (cap. 6d).
	const buttonSize = (h: number, fontSize: string, px: number) => ({
		minHeight: h,
		fontSize,
		padding: `0 ${px}px`,
	});

	return createTheme({
		tokens,
		palette: {
			mode: "dark",
			primary: { main: palette.primary },
			secondary: { main: palette.secondary },
			error: { main: palette.error },
			info: { main: palette.info },
			success: { main: status.success },
			warning: { main: status.warning },
			neutral: {
				main: neutral[600],
				light: neutral[800],
				dark: neutral[400],
				contrastText: neutral[1000],
			},
			background: {
				default: tokens.surface.base,
				paper: tokens.surface.raised,
			},
			text: {
				primary: tokens.text.primary,
				secondary: tokens.text.secondary,
			},
			divider: tokens.border.subtle,
		},
		shape: { borderRadius: radius.md },
		// Base 8pt (cap. 1): theme.spacing(2) === 16px.
		spacing: 8,
		typography: {
			fontFamily: '"IBM Plex Sans", "Roboto", "Helvetica", "Arial", sans-serif',
			// Interlineado 1.6 en texto pequeño (cap. 2c) y letter-spacing 0.
			body1: { fontSize: "1rem", lineHeight: 1.6 },
			body2: { fontSize: "0.875rem", lineHeight: 1.6 },
			caption: { fontSize: "0.75rem", lineHeight: 1.6 },
			subtitle1: { fontSize: "1rem", lineHeight: 1.5, fontWeight: 600 },
			subtitle2: { fontSize: "0.875rem", lineHeight: 1.5, fontWeight: 600 },
			h1: { fontWeight: 700, lineHeight: 1.15 },
			h2: { fontWeight: 700, lineHeight: 1.2 },
			h3: { fontWeight: 700, lineHeight: 1.25 },
			h4: { fontWeight: 700, lineHeight: 1.3 },
			h5: { fontWeight: 600, lineHeight: 1.35 },
			h6: { fontWeight: 600, lineHeight: 1.4 },
			button: {
				fontWeight: 600,
				textTransform: "none",
				letterSpacing: 0,
				lineHeight: 1.25,
			},
		},
		components: {
			MuiCssBaseline: {
				styleOverrides: `
					@font-face {
						font-family: 'IBM Plex Sans';
						font-style: normal;
						font-display: swap;
						font-weight: 100 700;
						src: url(${IBMPlexSansVariable}) format('woff2');
					}

					body {
						background-color: ${tokens.surface.base};
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
						text-rendering: optimizeLegibility;
					}

					.skip-to-content {
						position: fixed;
						top: -100%;
						left: 50%;
						transform: translateX(-50%);
						z-index: 99999;
						padding: 8px 24px;
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
				defaultProps: { disableRipple: true },
				styleOverrides: {
					root: {
						"&:focus-visible": {
							outline: `2px solid ${tokens.focusRing}`,
							outlineOffset: "2px",
						},
					},
				},
			},

			// ------------------------------------------------------ Botones
			MuiButton: {
				defaultProps: { disableElevation: true },
				styleOverrides: {
					root: {
						borderRadius: radius.md,
						transition:
							"background-color .15s, border-color .15s, color .15s, transform .1s",
						"&:active:not(.Mui-disabled)": { transform: "translateY(1px)" },
						"&.Mui-disabled": { opacity: 0.45 },
					},
					sizeSmall: buttonSize(controlHeight.sm, "0.875rem", 16),
					sizeMedium: buttonSize(controlHeight.md, "1rem", 20),
					sizeLarge: buttonSize(controlHeight.lg, "1rem", 28),
				},
				variants: [
					// Soft: terciario con peso visual (fondo tintado, sin borde).
					...(
						[
							"primary",
							"secondary",
							"error",
							"success",
							"warning",
							"info",
							"neutral",
						] as const
					).map((color) => ({
						props: { variant: "soft" as const, color },
						style: ({ theme }: { theme: import("@mui/material").Theme }) => {
							const main = theme.palette[color].main;
							const light = theme.palette[color].light;
							return {
								color: light,
								backgroundColor: alpha(main, 0.16),
								"&:hover": { backgroundColor: alpha(main, 0.26) },
								"&:active": { backgroundColor: alpha(main, 0.32) },
							};
						},
					})),
					// Outlined neutro: borde propio, no el color de acento.
					{
						props: { variant: "outlined" as const, color: "neutral" as const },
						style: {
							color: tokens.text.primary,
							borderColor: tokens.border.default,
							"&:hover": {
								borderColor: tokens.border.strong,
								backgroundColor: alpha(neutral[600], 0.12),
							},
						},
					},
					// Text neutro: terciario discreto.
					{
						props: { variant: "text" as const, color: "neutral" as const },
						style: {
							color: tokens.text.secondary,
							"&:hover": {
								color: tokens.text.primary,
								backgroundColor: alpha(neutral[600], 0.14),
							},
						},
					},
				],
			},
			MuiIconButton: {
				styleOverrides: {
					root: {
						borderRadius: radius.md,
						transition: "background-color .15s, color .15s",
					},
					sizeSmall: {
						width: controlHeight.sm - 4,
						height: controlHeight.sm - 4,
					},
					sizeMedium: { width: controlHeight.md, height: controlHeight.md },
				},
			},

			// ------------------------------------------------- Superficies
			MuiPaper: {
				styleOverrides: {
					// MUI aplica un degradado blanco por elevación en dark: lo quitamos.
					root: { backgroundImage: "none" },
				},
			},
			MuiDialog: {
				defaultProps: {
					slotProps: { backdrop: { sx: { backdropFilter: "blur(4px)" } } },
				},
				styleOverrides: {
					paper: {
						backgroundColor: tokens.surface.overlay,
						border: `1px solid ${tokens.border.default}`,
						borderRadius: radius.xl,
						boxShadow: tokens.elevation[3],
					},
				},
			},
			MuiDialogTitle: {
				styleOverrides: {
					root: {
						padding: "24px 24px 8px",
						fontSize: "1.25rem",
						fontWeight: 700,
						lineHeight: 1.3,
					},
				},
			},
			MuiDialogContent: {
				styleOverrides: {
					root: { padding: "8px 24px 16px" },
					dividers: {
						borderColor: tokens.border.subtle,
						padding: "16px 24px",
					},
				},
			},
			MuiDialogActions: {
				styleOverrides: {
					// Acción que avanza a la derecha (cap. 6h).
					root: {
						padding: "16px 24px 24px",
						gap: 8,
						"& > :not(style) ~ :not(style)": { marginLeft: 0 },
					},
				},
			},
			MuiCard: {
				styleOverrides: {
					root: {
						backgroundColor: tokens.surface.raised,
						border: `1px solid ${tokens.border.subtle}`,
						borderRadius: radius.lg,
						boxShadow: tokens.elevation[1],
					},
				},
			},
			MuiMenu: {
				styleOverrides: {
					paper: {
						backgroundColor: tokens.surface.overlay,
						border: `1px solid ${tokens.border.default}`,
						borderRadius: radius.lg,
						boxShadow: tokens.elevation[2],
					},
				},
			},
			MuiPopover: {
				styleOverrides: {
					paper: {
						backgroundColor: tokens.surface.overlay,
						border: `1px solid ${tokens.border.default}`,
						borderRadius: radius.lg,
						boxShadow: tokens.elevation[2],
					},
				},
			},
			MuiTooltip: {
				styleOverrides: {
					tooltip: {
						backgroundColor: neutral[200],
						border: `1px solid ${tokens.border.default}`,
						borderRadius: radius.sm,
						boxShadow: tokens.elevation[1],
						color: tokens.text.primary,
						fontSize: "0.8125rem",
						lineHeight: 1.5,
						padding: "6px 12px",
					},
					arrow: { color: neutral[200] },
				},
			},

			// ------------------------------------------------- Formularios
			MuiOutlinedInput: {
				styleOverrides: {
					root: {
						borderRadius: radius.md,
						backgroundColor: tokens.surface.sunken,
						"& .MuiOutlinedInput-notchedOutline": {
							borderColor: tokens.border.default,
							transition: "border-color .15s",
						},
						"&:hover .MuiOutlinedInput-notchedOutline": {
							borderColor: tokens.border.strong,
						},
						"&.Mui-focused .MuiOutlinedInput-notchedOutline": {
							borderWidth: 2,
						},
					},
				},
			},

			// ------------------------------------------------------ Chips
			MuiChip: {
				styleOverrides: {
					root: { borderRadius: radius.sm, fontWeight: 600 },
				},
			},
		},
	});
}

// Default theme (no prefs) — used as fallback before store hydrates
export const theme = createAppTheme();
