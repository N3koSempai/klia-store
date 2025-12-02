import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { API_BASE_URL } from "../constants/api";
import type {
	AppOfTheDayResponse,
	AppStream,
	AppSummary,
	AppsOfTheWeekResponse,
	Category,
	CategoryAppsResponse,
	SearchRequest,
	SearchResponse,
} from "../types";

const getTodayDate = (): string => {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

export const apiService = {
	async getCategories(): Promise<Category[]> {
		const response = await tauriFetch(`${API_BASE_URL}/collection/category`, {
			method: "GET",
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as Category[];
	},

	async getAppsOfTheWeek(): Promise<AppsOfTheWeekResponse> {
		const today = getTodayDate();
		const response = await tauriFetch(
			`${API_BASE_URL}/app-picks/apps-of-the-week/${today}`,
			{
				method: "GET",
				headers: {
					accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as AppsOfTheWeekResponse;
	},

	async getAppSummary(
		appId: string,
		branch: string = "main",
	): Promise<AppSummary> {
		const response = await tauriFetch(
			`${API_BASE_URL}/summary/${appId}?branch=${branch}`,
			{
				method: "GET",
				headers: {
					accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as AppSummary;
	},

	async getAppStream(appId: string): Promise<AppStream> {
		const response = await tauriFetch(`${API_BASE_URL}/appstream/${appId}`, {
			method: "GET",
			headers: {
				accept: "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as AppStream;
	},

	async getAppOfTheDay(): Promise<AppOfTheDayResponse> {
		const today = getTodayDate();
		const response = await tauriFetch(
			`${API_BASE_URL}/app-picks/app-of-the-day/${today}`,
			{
				method: "GET",
				headers: {
					accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as AppOfTheDayResponse;
	},

	async getCategoryApps(
		categoryId: string,
		locale: string = "en",
	): Promise<CategoryAppsResponse> {
		const response = await tauriFetch(
			`${API_BASE_URL}/collection/category/${categoryId}?locale=${locale}`,
			{
				method: "GET",
				headers: {
					accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as CategoryAppsResponse;
	},

	async searchApps(
		searchRequest: SearchRequest,
		locale: string = "en",
	): Promise<SearchResponse> {
		const response = await tauriFetch(
			`${API_BASE_URL}/search?locale=${locale}`,
			{
				method: "POST",
				headers: {
					accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(searchRequest),
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data as SearchResponse;
	},

	async getDeveloperApps(
		developerId: string,
		locale: string = "en",
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

		const response = await tauriFetch(
			`${API_BASE_URL}/search?locale=${locale}`,
			{
				method: "POST",
				headers: {
					accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(searchRequest),
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return { hits: data.hits } as CategoryAppsResponse;
	},
};
