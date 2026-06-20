import { Box } from "@mui/material";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LocalFlatpakInstallModal } from "../components/LocalFlatpakInstallModal";
import TitleBar from "../components/TitleBar";
import { useAppInitialization } from "../hooks/useAppInitialization";
import { useGitHubUpdates } from "../hooks/useGitHubUpdates";
import { useInstalledApps } from "../hooks/useInstalledApps";
import { Welcome } from "../pages/welcome/Welcome";

export const Route = createFileRoute("/_layout")({
	component: LayoutComponent,
});

function LayoutComponent() {
	const { t } = useTranslation();
	const { isFirstLaunch, isInitializing, error } = useAppInitialization();
	const [showWelcome, setShowWelcome] = useState(true);
	const [localFlatpakFile, setLocalFlatpakFile] = useState<string | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Load installed apps on startup (non-blocking)
	useInstalledApps();
	// Check GitHub-sourced app updates independently from Flathub
	useGitHubUpdates();

	// Listen for open-local-flatpak events emitted by Tauri when the app
	// is launched with a .flatpak or .flatpakref file as argument.
	useEffect(() => {
		let unlisten: (() => void) | undefined;
		listen<string>("open-local-flatpak", (event) => {
			setLocalFlatpakFile(event.payload);
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten?.();
		};
	}, []);

	const handleWelcomeComplete = () => {
		setShowWelcome(false);
	};

	// Show loading state while initializing
	if (isInitializing) {
		return (
			<>
				<TitleBar />
				<Box
					component="main"
					id="main-content"
					aria-busy="true"
					aria-label={t("common.initializing")}
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
			<a href="#main-content" className="skip-to-content">
				{t("common.skipToContent")}
			</a>
			<TitleBar />
			<Box
				component="main"
				id="main-content"
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
			<LocalFlatpakInstallModal
				filePath={localFlatpakFile}
				onClose={() => setLocalFlatpakFile(null)}
			/>
		</>
	);
}
