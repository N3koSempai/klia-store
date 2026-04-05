import type {
	AppOfTheDayResponse,
	AppStream,
	AppSummary,
	AppsOfTheWeekResponse,
	Category,
	CategoryApp,
	CategoryAppsResponse,
	SearchRequest,
	SearchResponse,
} from "../types";
import { apiClient } from "./apiClient";

const getTodayDate = (): string => {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const headers = { accept: "application/json" };

export const apiService = {
	async getCategories(): Promise<Category[]> {
		return apiClient.get<Category[]>("/collection/category", headers);
	},

	async getAppsOfTheWeek(): Promise<AppsOfTheWeekResponse> {
		const today = getTodayDate();
		return apiClient.get<AppsOfTheWeekResponse>(
			`/app-picks/apps-of-the-week/${today}`,
			headers,
		);
	},

	async getAppSummary(appId: string, branch = "main"): Promise<AppSummary> {
		return apiClient.get<AppSummary>(
			`/summary/${appId}?branch=${branch}`,
			headers,
		);
	},

	async getAppStream(appId: string): Promise<AppStream> {
		return apiClient.get<AppStream>(`/appstream/${appId}`, headers);
	},

	async getAppOfTheDay(): Promise<AppOfTheDayResponse> {
		const today = getTodayDate();
		return apiClient.get<AppOfTheDayResponse>(
			`/app-picks/app-of-the-day/${today}`,
			headers,
		);
	},

	async getCategoryApps(
		categoryId: string,
		locale = "en",
	): Promise<CategoryAppsResponse> {
		return apiClient.get<CategoryAppsResponse>(
			`/collection/category/${categoryId}?locale=${locale}`,
			headers,
		);
	},

	async searchApps(
		searchRequest: SearchRequest,
		locale = "en",
	): Promise<SearchResponse> {
		return apiClient.post<SearchResponse>(
			`/search?locale=${locale}`,
			searchRequest,
			headers,
		);
	},

	async getCategoryApp(
		appId: string,
		locale = "en",
	): Promise<CategoryApp | null> {
		const searchRequest: SearchRequest = {
			query: appId,
			hits_per_page: 5,
		};

		const data = await apiClient.post<SearchResponse>(
			`/search?locale=${locale}`,
			searchRequest,
			headers,
		);

		return data.hits.find((hit) => hit.app_id === appId) ?? null;
	},

	async getDeveloperApps(
		developerId: string,
		locale = "en",
	): Promise<CategoryAppsResponse> {
		const searchRequest: SearchRequest = {
			query: "",
			filters: [
				{
					filterType: "developer_name",
					value: developerId,
				},
			],
			hits_per_page: 100,
		};

		const data = await apiClient.post<SearchResponse>(
			`/search?locale=${locale}`,
			searchRequest,
			headers,
		);

		return { hits: data.hits } as CategoryAppsResponse;
	},
};
