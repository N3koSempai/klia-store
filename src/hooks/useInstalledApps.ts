import { useEffect } from "react";
import { refreshInstalledPackages } from "../services/installedPackages";

export const useInstalledApps = () => {
	useEffect(() => {
		// Execute asynchronously without blocking
		refreshInstalledPackages();
	}, []);
};
