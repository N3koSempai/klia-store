import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Home } from "../../pages/home/Home";
import type { CategoryApp } from "../../types";

interface HomeSearch {
	searchQuery?: string;
	searchResults?: CategoryApp[];
}

export const Route = createFileRoute("/_layout/")({
	validateSearch: (search: Record<string, unknown>): HomeSearch => ({
		searchQuery: search.searchQuery as string | undefined,
		searchResults: search.searchResults as CategoryApp[] | undefined,
	}),
	component: HomeRoute,
});

function HomeRoute() {
	const navigate = useNavigate();
	const { searchQuery, searchResults } = Route.useSearch();

	const handleAppSelect = (
		app: CategoryApp,
		query?: string,
		results?: CategoryApp[],
	) => {
		navigate({
			to: "/app/$appId",
			params: { appId: app.app_id },
			search: { searchQuery: query, searchResults: results },
		});
	};

	const handleCategorySelect = (categoryId: string) => {
		navigate({
			to: "/category/$categoryId",
			params: { categoryId },
		});
	};

	const handleMyAppsClick = () => {
		navigate({ to: "/my-apps" });
	};

	const handleAnalyticsClick = () => {
		navigate({ to: "/analytics" });
	};

	return (
		<Home
			onAppSelect={handleAppSelect}
			onCategorySelect={handleCategorySelect}
			onMyAppsClick={handleMyAppsClick}
			onAnalyticsClick={handleAnalyticsClick}
			initialSearchQuery={searchQuery}
			initialSearchResults={searchResults}
		/>
	);
}
