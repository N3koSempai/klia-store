import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import type { AppOfTheWeekWithDetails } from "../types";
import { dbCacheManager } from "../utils/dbCache";

export const useAppsOfTheWeek = () => {
	const [cachedData, setCachedData] = useState<AppOfTheWeekWithDetails[]>([]);
	const [shouldFetch, setShouldFetch] = useState(false);
	const [isChecking, setIsChecking] = useState(true);

	// Load cache immediately on mount
	useEffect(() => {
		const loadCache = async () => {
			try {
				const cached = await dbCacheManager.getCachedAppsOfTheWeek();
				let needsRefresh = false;

				if (cached.length > 0) {
					console.log("[useAppsOfTheWeek] Using cached apps of the week");

					// Check if any cached app is missing categoryApp
					const missingCategoryApp = cached.some((app) => !app.categoryApp);
					if (missingCategoryApp) {
						console.log(
							"[useAppsOfTheWeek] Some apps missing categoryApp, forcing refresh",
						);
						needsRefresh = true;
					} else {
						console.log("[useAppsOfTheWeek] All apps have categoryApp");
						setCachedData(cached);
					}
				}

				// Check if we need to update based on DB timestamp
				const shouldUpdate =
					await dbCacheManager.shouldUpdateSection("appsOfTheWeek");
				setShouldFetch(shouldUpdate || cached.length === 0 || needsRefresh);
			} catch (error) {
				console.error("Error loading cache:", error);
				setShouldFetch(true);
			} finally {
				setIsChecking(false);
			}
		};

		loadCache();
	}, []);

	// Query only executes if shouldFetch is true
	const query = useQuery({
		queryKey: ["appsOfTheWeek"],
		queryFn: async () => {
			console.log("Fetching fresh apps of the week from API");
			const response = await apiService.getAppsOfTheWeek();

			const appsWithDetails = await Promise.all(
				response.apps.map(async (app) => {
					const categoryApp = await apiService.getCategoryApp(app.app_id);

					if (!categoryApp) {
						throw new Error(`CategoryApp not found for ${app.app_id}`);
					}

					return {
						...app,
						name: categoryApp.name,
						icon: categoryApp.icon,
						summary: categoryApp.summary,
						appStream: {
							id: categoryApp.app_id,
							name: categoryApp.name,
							summary: categoryApp.summary,
							description: categoryApp.description,
							icon: categoryApp.icon,
						},
						categoryApp: categoryApp,
					} as AppOfTheWeekWithDetails;
				}),
			);

			await dbCacheManager.cacheAppsOfTheWeek(appsWithDetails);
			setCachedData(appsWithDetails);
			return appsWithDetails;
		},
		enabled: shouldFetch,
		retry: 3,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
	});

	// If checking cache, show as loading
	// If we have cached data, show it while updating in background
	return {
		data: cachedData.length > 0 ? cachedData : query.data,
		isLoading: isChecking || (query.isLoading && cachedData.length === 0),
		error: query.error,
	};
};
