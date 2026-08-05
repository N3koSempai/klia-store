import { apiService } from "../services/api";
import type { AppOfTheDayWithDetails } from "../types";
import { dbCacheManager } from "../utils/dbCache";
import { useCachedSectionQuery } from "./useCachedSectionQuery";

export const useAppOfTheDay = () => {
	return useCachedSectionQuery<AppOfTheDayWithDetails>({
		sectionName: "appOfTheDay",
		queryKey: "appOfTheDay",
		getCached: () => dbCacheManager.getCachedAppOfTheDay(),
		// Force a refresh if the cache predates categoryApp being stored.
		isEmpty: (data) => !data.categoryApp,
		fetcher: async () => {
			const response = await apiService.getAppOfTheDay();
			const categoryApp = await apiService.getCategoryApp(response.app_id);

			if (!categoryApp) {
				throw new Error(`CategoryApp not found for ${response.app_id}`);
			}

			return {
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
				categoryApp: categoryApp,
			} as AppOfTheDayWithDetails;
		},
		cacheResult: (data) => dbCacheManager.cacheAppOfTheDay(data),
	});
};
