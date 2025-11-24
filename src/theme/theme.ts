import { createTheme } from "@mui/material/styles";

// Import IBM Plex Sans Variable Font
import IBMPlexSansVariable from "../assets/fonts/IBMPlexSans-VariableFont_wdth,wght.ttf";

export const theme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: "#4A86CF",
		},
		secondary: {
			main: "#F6D32D",
		},
		error: {
			main: "#FF6B6B",
		},
		background: {
			default: "#0D1117",
			paper: "#161B22",
		},
		text: {
			primary: "#C9D1D9",
			secondary: "#8B949E",
		},
		info: {
			main: "#58A6FF",
		},
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
			`,
		},
	},
});
