import { Box } from "@mui/material";
import { useState } from "react";
import TitleBar from "./components/TitleBar";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useInstalledApps } from "./hooks/useInstalledApps";
import { AppDetails } from "./pages/appDetails/AppDetails";
import { CategoryApps } from "./pages/categoryApps/CategoryApps";
import { Home } from "./pages/home/Home";
import { MyApps } from "./pages/myApps/MyApps";
import { Welcome } from "./pages/welcome/Welcome";
import type { AppStream } from "./types";
import "./App.css";

function App() {
	const [selectedApp, setSelectedApp] = useState<AppStream | null>(null);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [showMyApps, setShowMyApps] = useState(false);
	const [showWelcome, setShowWelcome] = useState(true);
	const { isFirstLaunch, isInitializing, error } = useAppInitialization();

	// Load installed apps on startup (non-blocking)
	// This also loads available updates after installed apps are loaded
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
					<p>Initializing Klia Store...</p>
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
					<p>Error initializing app:</p>
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
				sx={{
					marginTop: "40px",
					height: "calc(100vh - 40px)",
					overflow: "auto",
					border: "1px solid rgba(255,255,255,0.05)",
					borderTop: "none",
				}}
			>
				{selectedApp && (
					<AppDetails
						app={selectedApp}
						onBack={() => {
							setSelectedApp(null);
						}}
					/>
				)}

				{selectedCategory && (
					<CategoryApps
						categoryId={selectedCategory}
						onBack={() => setSelectedCategory(null)}
						onAppSelect={setSelectedApp}
					/>
				)}

				{showMyApps && <MyApps onBack={() => setShowMyApps(false)} />}

				{!selectedApp && !selectedCategory && !showMyApps && (
					<Home
						onAppSelect={setSelectedApp}
						onCategorySelect={setSelectedCategory}
						onMyAppsClick={() => setShowMyApps(true)}
					/>
				)}
			</Box>
		</>
	);
}

export default App;
