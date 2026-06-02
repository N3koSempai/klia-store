import { CssBaseline, ThemeProvider } from "@mui/material";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAccessibilityStore } from "../store/accessibilityStore";
import { createAppTheme } from "../theme/theme";
import "../i18n/config";
import "../App.css";

interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
});

function RootComponent() {
	const { colorBlindMode, reducedMotion, highContrast } = useAccessibilityStore();
	const { i18n } = useTranslation();

	// Keep <html lang> in sync with active i18next language
	useEffect(() => {
		document.documentElement.lang = i18n.language;
	}, [i18n.language]);

	const appTheme = useMemo(
		() => createAppTheme({ colorBlindMode, reducedMotion, highContrast }),
		[colorBlindMode, reducedMotion, highContrast],
	);

	return (
		<ThemeProvider theme={appTheme}>
			<CssBaseline />
			{reducedMotion && (
				<style>{`
					*, *::before, *::after {
						animation-duration: 0.01ms !important;
						transition-duration: 0.01ms !important;
					}
				`}</style>
			)}
			<Outlet />
		</ThemeProvider>
	);
}
