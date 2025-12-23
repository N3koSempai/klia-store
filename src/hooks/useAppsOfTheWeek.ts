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
				if (cached.length > 0) {
					console.log("Using cached apps of the week");
					setCachedData(cached);
				}

				// Check if we need to update based on DB timestamp
				const shouldUpdate =
					await dbCacheManager.shouldUpdateSection("appsOfTheWeek");
				setShouldFetch(shouldUpdate || cached.length === 0);
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
			try {
				console.log("Fetching fresh apps of the week from API");
				const response = await apiService.getAppsOfTheWeek();

				const appsWithDetails = await Promise.all(
					response.apps.map(async (app) => {
						try {
							const appStream = await apiService.getAppStream(app.app_id);
							return {
								...app,
								name: appStream.name,
								icon: appStream.icon || appStream.icons?.[0]?.url,
								summary: appStream.summary,
								appStream: appStream,
							} as AppOfTheWeekWithDetails;
						} catch (error) {
							console.error(
								`Error fetching appstream for ${app.app_id}:`,
								error,
							);
							return {
								...app,
								name: app.app_id,
							} as AppOfTheWeekWithDetails;
						}
					}),
				);

				await dbCacheManager.cacheAppsOfTheWeek(appsWithDetails);
				setCachedData(appsWithDetails);
				return appsWithDetails;
			} catch (error) {
				console.error("Failed to fetch apps of the week:", error);
				// If API fails and we have cache, use it
				if (cachedData.length > 0) {
					console.log("API failed, using cached apps of the week");
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
		data: cachedData.length > 0 ? cachedData : query.data,
		isLoading: isChecking || (query.isLoading && cachedData.length === 0),
		error: query.error,
	};
};
