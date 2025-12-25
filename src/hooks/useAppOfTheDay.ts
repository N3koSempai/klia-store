import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import type { AppOfTheDayWithDetails } from "../types";
import { dbCacheManager } from "../utils/dbCache";

export const useAppOfTheDay = () => {
	const [cachedData, setCachedData] = useState<AppOfTheDayWithDetails | null>(
		null,
	);
	const [shouldFetch, setShouldFetch] = useState(false);
	const [isChecking, setIsChecking] = useState(true);

	// Load cache immediately on mount
	useEffect(() => {
		const loadCache = async () => {
			try {
				const cached = await dbCacheManager.getCachedAppOfTheDay();
				let needsRefresh = false;

				if (cached) {
					console.log("[useAppOfTheDay] Using cached app of the day");
					console.log(
						"[useAppOfTheDay] Cached has categoryApp:",
						!!cached.categoryApp,
					);
					console.log(
						"[useAppOfTheDay] Cached license:",
						cached.categoryApp?.project_license,
					);

					// If cached data doesn't have categoryApp, force refresh
					if (!cached.categoryApp) {
						console.log(
							"[useAppOfTheDay] Cache missing categoryApp, forcing refresh",
						);
						needsRefresh = true;
					} else {
						setCachedData(cached);
					}
				}

				// Check if we need to update based on DB timestamp
				const shouldUpdate =
					await dbCacheManager.shouldUpdateSection("appOfTheDay");
				setShouldFetch(shouldUpdate || !cached || needsRefresh);
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
		queryKey: ["appOfTheDay"],
		queryFn: async () => {
			try {
				console.log("Fetching fresh app of the day from API");
				const response = await apiService.getAppOfTheDay();

				// Try to get full CategoryApp first
				console.log(
					"[useAppOfTheDay] Fetching CategoryApp for:",
					response.app_id,
				);
				const categoryApp = await apiService.getCategoryApp(response.app_id);
				console.log(
					"[useAppOfTheDay] CategoryApp result:",
					categoryApp ? "FOUND" : "NOT FOUND",
				);

				let appData: AppOfTheDayWithDetails;

				if (categoryApp) {
					console.log(
						"[useAppOfTheDay] Using CategoryApp with license:",
						categoryApp.project_license,
					);
					// Use CategoryApp data - convert to AppStream format for appStream field
					appData = {
						...response,
						name: categoryApp.name,
						icon: categoryApp.icon,
						appStream: {
							id: categoryApp.app_id,
							name: categoryApp.name,
							summary: categoryApp.summary,
							description: categoryApp.description,
							icon: categoryApp.icon,
						},
						categoryApp: categoryApp, // Add full CategoryApp
					} as AppOfTheDayWithDetails;
				} else {
					console.log("[useAppOfTheDay] Falling back to AppStream");
					// Fallback to old method
					const appStream = await apiService.getAppStream(response.app_id);
					appData = {
						...response,
						name: appStream.name,
						icon: appStream.icon || appStream.icons?.[0]?.url,
						appStream: appStream,
					} as AppOfTheDayWithDetails;
				}

				await dbCacheManager.cacheAppOfTheDay(appData);
				setCachedData(appData);
				return appData;
			} catch (error) {
				console.error("Failed to fetch app of the day:", error);
				// If API fails and we have cache, use it
				if (cachedData) {
					console.log("API failed, using cached data");
					return cachedData;
				}
				throw error;
			}
		},
		enabled: shouldFetch,
		retry: false,
	});

	// If checking cache, show as loading
	// If we have cached data, show it while updating in background
	return {
		data: cachedData || query.data,
		isLoading: isChecking || (query.isLoading && !cachedData),
		error: query.error,
	};
};
