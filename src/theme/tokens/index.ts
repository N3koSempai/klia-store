// Tokens de diseño en tres capas. Fuente de verdad visual: "Roots of UI/UX
// Design" (Creative Tim). Los componentes NO leen primitivos: usan los
// semánticos (`createSemanticTokens`) a través del tema.
//
//   1. primitivos  → valores crudos (rampas de color, escala de 8pt, radios)
//   2. semánticos  → significado (surface, border, tone). Cambian con a11y.
//   3. componente  → viven en `theme.ts` (overrides de MUI), no aquí.

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
	border: { subtle: string; default: string; strong: string };
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
