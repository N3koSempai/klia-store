import { apiService } from "../services/api";
import type { AppOfTheWeekWithDetails, AppsOfTheWeekResponse } from "../types";
import { dbCacheManager } from "../utils/dbCache";
import { useCachedSectionQuery } from "./useCachedSectionQuery";

// Flathub's /search endpoint has no batch-by-app_id filter, so each app
// needs its own request. Cap concurrency instead of firing them all at once.
const CATEGORY_APP_CONCURRENCY = 4;

const fetchAppsWithDetails = async (
	apps: AppsOfTheWeekResponse["apps"],
): Promise<AppOfTheWeekWithDetails[]> => {
	const results: AppOfTheWeekWithDetails[] = new Array(apps.length);
	let nextIndex = 0;

	const worker = async () => {
		while (true) {
			const index = nextIndex++;
			if (index >= apps.length) return;

			const app = apps[index];
			const categoryApp = await apiService.getCategoryApp(app.app_id);
			if (!categoryApp) {
				throw new Error(`CategoryApp not found for ${app.app_id}`);
			}

			results[index] = {
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
		}
	};

	await Promise.all(
		Array.from(
			{ length: Math.min(CATEGORY_APP_CONCURRENCY, apps.length) },
			worker,
		),
	);

	return results;
};

export const useAppsOfTheWeek = () => {
	return useCachedSectionQuery<AppOfTheWeekWithDetails[]>({
		sectionName: "appsOfTheWeek",
		queryKey: "appsOfTheWeek",
		getCached: () => dbCacheManager.getCachedAppsOfTheWeek(),
		// Force a refresh if there's no cache, or any cached app predates categoryApp being stored.
		isEmpty: (data) =>
			data.length === 0 || data.some((app) => !app.categoryApp),
		fetcher: async () => {
			const response = await apiService.getAppsOfTheWeek();
			return fetchAppsWithDetails(response.apps);
		},
		cacheResult: (data) => dbCacheManager.cacheAppsOfTheWeek(data),
	});
};
