import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";
import { apiService } from "../../services/api";
import type { CategoryApp } from "../../types";

const AppDetails = lazy(() =>
	import("../../pages/appDetails/AppDetails").then((m) => ({
		default: m.AppDetails,
	})),
);

interface AppSearch {
	searchQuery?: string;
	searchResults?: CategoryApp[];
}

function LoadingFallback() {
	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				height: "100%",
			}}
		>
			<img src={kliaAnimation} alt="Loading" width={120} height={120} />
		</Box>
	);
}

export const Route = createFileRoute("/_layout/app/$appId")({
	validateSearch: (search: Record<string, unknown>): AppSearch => ({
		searchQuery: search.searchQuery as string | undefined,
		searchResults: search.searchResults as CategoryApp[] | undefined,
	}),
	loader: async ({ params }) => {
		const app = await apiService.getCategoryApp(params.appId);
		if (!app) {
			throw new Error(`App not found: ${params.appId}`);
		}
		return { app };
	},
	pendingComponent: LoadingFallback,
	pendingMs: 0,
	component: AppDetailsRoute,
});

function AppDetailsRoute() {
	const { app } = Route.useLoaderData();
	const { searchQuery, searchResults } = Route.useSearch();
	const navigate = useNavigate();

	const handleBack = () => {
		if (searchQuery && searchResults) {
			navigate({ to: "/", search: { searchQuery, searchResults } });
		} else {
			navigate({ to: "/" });
		}
	};

	return (
		<Suspense fallback={<LoadingFallback />}>
			<AppDetails app={app} onBack={handleBack} />
		</Suspense>
	);
}
