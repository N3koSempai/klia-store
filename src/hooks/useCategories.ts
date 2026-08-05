import { apiService } from "../services/api";
import { dbCacheManager } from "../utils/dbCache";
import { useCachedSectionQuery } from "./useCachedSectionQuery";

export const useCategories = () => {
	return useCachedSectionQuery<string[]>({
		sectionName: "categories",
		queryKey: "categories",
		maxDaysOld: 7,
		getCached: () => dbCacheManager.getCachedCategories(),
		isEmpty: (data) => data.length === 0,
		fetcher: () => apiService.getCategories(),
		cacheResult: (data) => dbCacheManager.cacheCategories(data),
		retry: false,
		onFetchError: (error, cachedData) => {
			console.error("Failed to fetch categories:", error);
			if (cachedData.length > 0) {
				console.log("API failed, using cached categories");
				return cachedData;
			}
			throw error;
		},
	});
};
