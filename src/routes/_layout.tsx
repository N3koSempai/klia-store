import { Box } from "@mui/material";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "../components/TitleBar";
import { useAppInitialization } from "../hooks/useAppInitialization";
import { useInstalledApps } from "../hooks/useInstalledApps";
import { Welcome } from "../pages/welcome/Welcome";

export const Route = createFileRoute("/_layout")({
	component: LayoutComponent,
});

function LayoutComponent() {
	const { t } = useTranslation();
	const { isFirstLaunch, isInitializing, error } = useAppInitialization();
	const [showWelcome, setShowWelcome] = useState(true);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Load installed apps on startup (non-blocking)
	useInstalledApps();

	const handleWelcomeComplete = () => {
		setShowWelcome(false);
	};

	// Show loading state while initializing
	if (isInitializing) {
		return (
			<>
				<TitleBar />
				<Box
					sx={{
						marginTop: "40px",
						height: "calc(100vh - 40px)",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						border: "1px solid rgba(255,255,255,0.05)",
						borderTop: "none",
					}}
				>
					<p>{t("common.initializing")}</p>
				</Box>
			</>
		);
	}

	// Show error if initialization failed
	if (error) {
		return (
			<>
				<TitleBar />
				<Box
					sx={{
						marginTop: "40px",
						height: "calc(100vh - 40px)",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
						flexDirection: "column",
						border: "1px solid rgba(255,255,255,0.05)",
						borderTop: "none",
					}}
				>
					<p>{t("common.errorInitializing")}</p>
					<p>{error}</p>
				</Box>
			</>
		);
	}

	// Show welcome screen on first launch
	if (isFirstLaunch && showWelcome) {
		return (
			<>
				<TitleBar />
				<Box
					sx={{
						marginTop: "40px",
						height: "calc(100vh - 40px)",
						overflow: "auto",
						border: "1px solid rgba(255,255,255,0.05)",
						borderTop: "none",
					}}
				>
					<Welcome onComplete={handleWelcomeComplete} />
				</Box>
			</>
		);
	}

	// Show main app with TitleBar and scroll container for child routes
	return (
		<>
			<TitleBar />
			<Box
				ref={scrollContainerRef}
				sx={{
					marginTop: "40px",
					height: "calc(100vh - 40px)",
					overflow: "auto",
					border: "1px solid rgba(255,255,255,0.05)",
					borderTop: "none",
				}}
			>
				<Outlet />
			</Box>
		</>
	);
}
