// Tokens de diseño en tres capas. Fuente de verdad visual: "Roots of UI/UX
// Design" (Creative Tim). Los componentes NO leen primitivos: usan los
// semánticos (`createSemanticTokens`) a través del tema.
//
//   1. primitivos  → valores crudos (rampas de color, escala de 8pt, radios)
//   2. semánticos  → significado (surface, border, tone). Cambian con a11y.
//   3. componente  → viven en `theme.ts` (overrides de MUI), no aquí.

import type { ColorBlindMode } from "../../store/accessibilityStore";
import { contrastRatio, parseColor } from "./contrast.ts";

// ------------------------------------------------------------- Primitivos

// Escala 8pt (cap. 1): todo múltiplo de 8; 4px solo para texto/baseline.
export const space = {
	xs: 4,
	sm: 8,
	md: 16,
	lg: 24,
	xl: 32,
	xxl: 40,
} as const;

// Regla de anidación (cap. 4): el radio interior es menor que el del contenedor.
export const radius = {
	sm: 6, // chips, badges, bloques de código
	md: 10, // botones, inputs, icon buttons
	lg: 14, // tarjetas internas
	xl: 18, // diálogos y superficies principales
	pill: 999,
} as const;

// Alturas mínimas de botón: objetivo táctil >= 36px (Material) / 40px (Apple).
export const controlHeight = { sm: 36, md: 40, lg: 48 } as const;

// Neutros: sin negro puro (cap. 3b). Tints sobre el fondo para elevar.
export const neutral = {
	0: "#0A0E14",
	50: "#0D1117", // fondo de app
	100: "#161B22", // superficie elevada
	150: "#1C2128", // overlay (diálogos, menús)
	200: "#21262D",
	300: "#30363D",
	400: "#484F58",
	500: "#6E7681",
	600: "#8B949E",
	700: "#9CAAB6",
	800: "#C9D1D9",
	900: "#E6EDF3",
	1000: "#FFFFFF",
} as const;

export const status = {
	success: "#3FB950",
	warning: "#D29922",
	danger: "#F85149",
	info: "#58A6FF",
} as const;

// ------------------------------------------------------------- Semánticos

export interface SemanticTokens {
	surface: { base: string; raised: string; overlay: string; sunken: string };
	// `control` delimita inputs y botones con contorno: >= 3:1 (WCAG 1.4.11).
	// subtle/default/strong son decorativos (cards, divisores).
	border: { subtle: string; default: string; strong: string; control: string };
	text: { primary: string; secondary: string; muted: string };
	// Sombras de dos capas: core (anillo oscuro y estrecho) + cast (amplia y
	// suave). Nunca blancas ni hacia arriba en modo oscuro (cap. 5).
	elevation: { 1: string; 2: string; 3: string };
	focusRing: string;
}

export const createSemanticTokens = (opts: {
	highContrast: boolean;
	accent: string;
}): SemanticTokens => {
	const hc = opts.highContrast;
	return {
		surface: {
			base: neutral[50],
			raised: hc ? "#1C2333" : neutral[100],
			overlay: hc ? "#222B3F" : neutral[150],
			sunken: "rgba(1, 4, 9, 0.45)",
		},
		border: {
			subtle: hc ? "rgba(240, 246, 252, 0.22)" : "rgba(240, 246, 252, 0.08)",
			default: hc ? "rgba(240, 246, 252, 0.4)" : "rgba(240, 246, 252, 0.14)",
			strong: hc ? "rgba(240, 246, 252, 0.6)" : "rgba(240, 246, 252, 0.24)",
			control: hc ? "rgba(240, 246, 252, 0.6)" : "rgba(240, 246, 252, 0.42)",
		},
		text: {
			primary: hc ? neutral[1000] : neutral[800],
			secondary: hc ? "#C0CFDF" : neutral[700], // 4.5:1 AA (antes #8B949E)
			muted: hc ? "#A9B8C8" : neutral[600],
		},
		elevation: {
			1: "0 0 0 1px rgba(1,4,9,0.5), 0 2px 6px rgba(1,4,9,0.35)",
			2: "0 0 0 1px rgba(1,4,9,0.55), 0 6px 16px rgba(1,4,9,0.45)",
			3: "0 0 0 1px rgba(1,4,9,0.6), 0 20px 48px -8px rgba(1,4,9,0.7)",
		},
		focusRing: opts.accent,
	};
};

// ----------------------------------------------------------- Marca / extras

// Colores de marca. Coinciden con `palette.*` del tema en modo normal; el tema
// los sustituye en los modos de daltonismo (usar `theme.palette` cuando el
// contexto lo permita y estos solo en lugares sin acceso al tema).
export const brand = {
	primary: "#4A86CF",
	primaryDark: "#3D74B8",
	secondary: "#F6D32D",
	secondaryLight: "#F8DB4E",
	secondaryPale: "#F8E45C",
	danger: "#FF6B6B",
	dangerLight: "#FF8585",
	dangerSoft: "#FFA198",
} as const;

// Líneas y rellenos translúcidos estáticos (equivalen a `border.*` en modo
// normal). Para estilos fuera del tema; dentro de `sx` preferir
// `theme.tokens.border`.
export const lines = {
	subtle: "rgba(240, 246, 252, 0.08)",
	default: "rgba(240, 246, 252, 0.14)",
	strong: "rgba(240, 246, 252, 0.24)",
} as const;

// Paleta de terminal / sintaxis / visualización de datos (Analytics, Terminal,
// gradientes decorativos). Independiente del tema de la app a propósito.
export const hues = {
	green: "#27C93F",
	greenBright: "#7EE787",
	greenSoft: "#56D364",
	greenDeep: "#2EA043",
	greenDark: "#238636",
	greenLime: "#2ED547",
	greenMaterial: "#4CAF50",
	greenMaterialDark: "#43A047",
	orange: "#FFA657",
	orangeDeep: "#FF9800",
	orangeRed: "#FF4500",
	amber: "#FFB11B",
	amberDeep: "#E3A918",
	gold: "#FFD700",
	macYellow: "#FFBD2E",
	macRed: "#FF5F56",
	red: "#FF5252",
	redMaterial: "#E53935",
	redTailwind: "#EF4444",
	redWindows: "#E81123",
	redSyntax: "#FF7B72",
	skyBlue: "#87CEEB",
	blueLight: "#79C0FF",
	bluePale: "#A5D6FF",
	purple: "#D2A8FF",
	purpleSoft: "#BC8CFF",
	brown: "#B98A5E",
	grayLight: "#D4D4D4",
	grayDark: "#323232",
	grayDarker: "#1E1E1E",
	grayDarkest: "#1A1A1A",
} as const;

// ------------------------------------------------------------ Accesibilidad

// Color palettes per color-blind mode
// Each palette replaces primary/secondary/error with perceptually distinct hues
export const colorBlindPalettes: Record<
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

// ------------------------------------------------- Botón relleno accesible

const WHITE = "#FFFFFF";
const toHex = (rgb: number[]) =>
	`#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

// Par fondo/texto para un botón relleno que cumple AA (4.5:1) sin cambiar el
// matiz. Colores medios (azul de marca) se oscurecen para conservar texto
// blanco; los claros (amarillo, verde, rojo) mantienen su tono con texto oscuro.
export const solidButtonColors = (
	main: string,
): { background: string; text: string } => {
	if (contrastRatio(WHITE, main) >= 4.5)
		return { background: main, text: WHITE };
	if (
		contrastRatio(WHITE, main) < 3 &&
		contrastRatio(neutral[50], main) >= 4.5
	) {
		return { background: main, text: neutral[50] };
	}
	const { rgb } = parseColor(main);
	for (let k = 0.95; k > 0.3; k -= 0.025) {
		const background = toHex(rgb.map((c) => c * k));
		if (contrastRatio(WHITE, background) >= 4.5) {
			return { background, text: WHITE };
		}
	}
	return { background: neutral[50], text: WHITE };
};
