import type { SemanticTokens } from "./tokens";

// Extensiones tipadas del tema de MUI: variante "soft", color "neutral" y
// acceso a los tokens semánticos como `theme.tokens`.
declare module "@mui/material/styles" {
	interface Theme {
		tokens: SemanticTokens;
	}
	interface ThemeOptions {
		tokens?: SemanticTokens;
	}
	interface Palette {
		neutral: Palette["primary"];
	}
	interface PaletteOptions {
		neutral?: PaletteOptions["primary"];
	}
}

declare module "@mui/material/Button" {
	interface ButtonPropsVariantOverrides {
		soft: true;
	}
	interface ButtonPropsColorOverrides {
		neutral: true;
	}
}

declare module "@mui/material/IconButton" {
	interface IconButtonPropsColorOverrides {
		neutral: true;
	}
}
