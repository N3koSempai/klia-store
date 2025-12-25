export type Category = string;

export interface CategoryResponse {
	categories: Category[];
}

export interface AppOfTheWeek {
	app_id: string;
	position: number;
	isFullscreen: boolean;
}

export interface AppsOfTheWeekResponse {
	apps: AppOfTheWeek[];
}

export interface AppSummary {
	arches: string[];
	branch: string;
	metadata: {
		sdk?: string;
		base?: string;
		name: string;
		command?: string;
		runtime?: string;
		permissions?: {
			shared?: string[];
			devices?: string[];
			sockets?: string[];
			"session-bus"?: {
				talk?: string[];
			};
		};
		"built-extensions"?: string[];
		runtimeIsEol?: boolean;
	};
	timestamp: number;
	download_size: number;
	installed_size: number;
}

export interface AppOfTheWeekWithDetails extends AppOfTheWeek {
	name?: string;
	icon?: string;
	summary?: string;
	appStream?: AppStream;
	categoryApp?: CategoryApp;
}

export interface AppStream {
	id: string;
	name: string;
	summary: string;
	description?: string;
	icon?: string;
	icons?: Array<{
		url: string;
		type: string;
		width: string;
		height: string;
	}>;
	screenshots?: Array<{
		sizes: Array<{
			width: string;
			height: string;
			scale: string;
			src: string;
		}>;
		caption?: string;
		default?: boolean;
	}>;
	releases?: Array<{
		timestamp: string;
		version: string;
		description: string;
		url?: string;
	}>;
	urls?: {
		homepage?: string;
		bugtracker?: string;
		vcs_browser?: string;
		help?: string;
		donation?: string;
		translate?: string;
		contact?: string;
		contribute?: string;
		faq?: string;
	};
}

export interface AppOfTheDayResponse {
	app_id: string;
	day: string;
}

export interface AppOfTheDayWithDetails extends AppOfTheDayResponse {
	name?: string;
	icon?: string;
	appStream?: AppStream;
	categoryApp?: CategoryApp;
}

export interface CategoryApp {
	name: string;
	keywords: string[] | null;
	summary: string;
	description: string;
	id: string;
	type: string;
	translations: Record<string, unknown>;
	project_license: string;
	is_free_license: boolean;
	app_id: string;
	icon: string;
	main_categories: string;
	sub_categories: string[];
	developer_name: string;
	verification_verified: boolean;
	verification_method: string;
	verification_login_name: string | null;
	verification_login_provider: string | null;
	verification_login_is_organization: string | null;
	verification_website: string | null;
	verification_timestamp: string | null;
	runtime: string;
	updated_at: number;
	arches: string[];
	added_at: number;
	trending: number;
	installs_last_month: number;
	isMobileFriendly: boolean;
}

export interface CategoryAppsResponse {
	hits: CategoryApp[];
}

export interface SearchFilter {
	filterType: string;
	value: string;
}

export interface SearchRequest {
	query: string;
	filters?: SearchFilter[];
	hits_per_page?: number;
	page?: number;
}

export interface SearchResponse {
	hits: CategoryApp[];
	query: string;
	processingTimeMs: number;
	hitsPerPage: number;
	page: number;
	totalPages: number;
	totalHits: number;
	facetDistribution?: Record<string, Record<string, number>>;
	facetStats?: Record<string, Record<string, number>>;
}
