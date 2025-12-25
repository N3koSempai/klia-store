import { Box } from "@mui/material";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useInstalledApps } from "./hooks/useInstalledApps";
import { AppDetails } from "./pages/appDetails/AppDetails";
import { CategoryApps } from "./pages/categoryApps/CategoryApps";
import { DeveloperProfile } from "./pages/developerProfile/DeveloperProfile";
import { Home } from "./pages/home/Home";
import { MyApps } from "./pages/myApps/MyApps";
import { Welcome } from "./pages/welcome/Welcome";
import type { CategoryApp } from "./types";
import "./App.css";

type ViewType = "home" | "appDetails" | "category" | "myApps" | "developer";

interface NavigationState {
	view: ViewType;
	app?: CategoryApp;
	category?: string;
	developerId?: string;
	developerName?: string;
	developerAppId?: string;
	scrollPosition?: number;
}

function App() {
	const { t } = useTranslation();
	const [navigationStack, setNavigationStack] = useState<NavigationState[]>([
		{ view: "home" },
	]);
	const [showWelcome, setShowWelcome] = useState(true);
	const { isFirstLaunch, isInitializing, error } = useAppInitialization();
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Load installed apps on startup (non-blocking)
	// This also loads available updates after installed apps are loaded
	useInstalledApps();

	const handleWelcomeComplete = () => {
		setShowWelcome(false);
	};

	const currentState = navigationStack[navigationStack.length - 1];

	const saveScrollPosition = () => {
		if (scrollContainerRef.current) {
			const scrollPosition = scrollContainerRef.current.scrollTop;
			setNavigationStack((prev) => {
				const newStack = [...prev];
				newStack[newStack.length - 1] = {
					...newStack[newStack.length - 1],
					scrollPosition,
				};
				return newStack;
			});
		}
	};

	const restoreScrollPosition = (position?: number) => {
		if (scrollContainerRef.current && position !== undefined) {
			scrollContainerRef.current.scrollTop = position;
		}
	};

	const navigateTo = (state: NavigationState) => {
		saveScrollPosition();
		setNavigationStack((prev) => [...prev, state]);
		// Reset scroll to top for new views
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop = 0;
		}
	};

	const navigateBack = () => {
		if (navigationStack.length > 1) {
			setNavigationStack((prev) => {
				const newStack = prev.slice(0, -1);
				// Restore scroll position after state update
				setTimeout(() => {
					restoreScrollPosition(newStack[newStack.length - 1].scrollPosition);
				}, 0);
				return newStack;
			});
		}
	};

	const handleAppSelect = (app: CategoryApp) => {
		navigateTo({ view: "appDetails", app });
	};

	const handleCategorySelect = (categoryId: string) => {
		navigateTo({ view: "category", category: categoryId });
	};

	const handleMyAppsClick = () => {
		navigateTo({ view: "myApps" });
	};

	const handleDeveloperSelect = (
		developerId: string,
		developerName: string,
		appId: string,
	) => {
		navigateTo({
			view: "developer",
			developerId,
			developerName,
			developerAppId: appId,
		});
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

	// Show main app with TitleBar
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
				{currentState.view === "appDetails" && currentState.app && (
					<AppDetails app={currentState.app} onBack={navigateBack} />
				)}

				{currentState.view === "category" && currentState.category && (
					<CategoryApps
						categoryId={currentState.category}
						onBack={navigateBack}
						onAppSelect={handleAppSelect}
					/>
				)}

				{currentState.view === "developer" &&
					currentState.developerId &&
					currentState.developerName && (
						<DeveloperProfile
							developerId={currentState.developerId}
							developerName={currentState.developerName}
							appId={currentState.developerAppId}
							onBack={navigateBack}
							onAppSelect={handleAppSelect}
						/>
					)}

				{currentState.view === "myApps" && (
					<MyApps
						onBack={navigateBack}
						onDeveloperSelect={handleDeveloperSelect}
					/>
				)}

				{currentState.view === "home" && (
					<Home
						onAppSelect={handleAppSelect}
						onCategorySelect={handleCategorySelect}
						onMyAppsClick={handleMyAppsClick}
					/>
				)}
			</Box>
		</>
	);
}

export default App;
