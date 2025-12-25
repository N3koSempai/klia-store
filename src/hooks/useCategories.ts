import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { dbCacheManager } from "../utils/dbCache";

export const useCategories = () => {
	const [cachedData, setCachedData] = useState<string[]>([]);
	const [shouldFetch, setShouldFetch] = useState(false);
	const [isChecking, setIsChecking] = useState(true);

	// Load cache immediately on mount
	useEffect(() => {
		const loadCache = async () => {
			try {
				const cached = await dbCacheManager.getCachedCategories();
				if (cached.length > 0) {
					console.log("Using cached categories");
					setCachedData(cached);
				}

				// Check if we need to update based on DB timestamp (weekly cache = 7 days)
				const shouldUpdate = await dbCacheManager.shouldUpdateSection(
					"categories",
					7,
				);
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
		queryKey: ["categories"],
		queryFn: async () => {
			try {
				console.log("Fetching fresh categories from API");
				const categories = await apiService.getCategories();
				await dbCacheManager.cacheCategories(categories);
				setCachedData(categories);
				return categories;
			} catch (error) {
				console.error("Failed to fetch categories:", error);
				// If API fails and we have cache, use it
				if (cachedData.length > 0) {
					console.log("API failed, using cached categories");
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
