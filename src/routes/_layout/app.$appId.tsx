import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";
import { OFF_FLATHUB_APPS } from "../../data/offFlathubApps";
import { apiService } from "../../services/api";
import { reportNetworkFailure, reportNetworkSuccess } from "../../store/connectivityStore";
import type { CategoryApp } from "../../types";
import { isNetworkError } from "../../utils/networkError";

const AppDetails = lazy(() =>
	import("../../pages/appDetails/AppDetails").then((m) => ({
		default: m.AppDetails,
	})),
);

interface AppSearch {
	searchQuery?: string;
	searchResults?: CategoryApp[];
	// App tal como la tenía la tarjeta desde la que se navegó (Home, búsqueda,
	// categoría...). Sirve de fallback local-first si el fetch de red falla.
	selectedApp?: CategoryApp;
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
		selectedApp: search.selectedApp as CategoryApp | undefined,
	}),
	loaderDeps: ({ search }) => ({ selectedApp: search.selectedApp }),
	loader: async ({ params, deps }) => {
		const offFlathub = OFF_FLATHUB_APPS[params.appId];
		if (offFlathub) {
			return { app: offFlathub };
		}

		// La red tiene prioridad (trae datos frescos). Si falla, caemos en
		// silencio al app tal como la teníamos (tarjeta de origen o, en su
		// defecto, nada) en vez de romper la navegación.
		const startedAt = Date.now();
		try {
			const app = await apiService.getCategoryApp(params.appId);
			reportNetworkSuccess(startedAt);
			if (app) return { app };
		} catch (error) {
			console.error("Error fetching app details, using local fallback:", error);
			if (isNetworkError(error)) {
				reportNetworkFailure();
			}
		}

		if (deps.selectedApp) {
			return { app: deps.selectedApp };
		}

		throw new Error(`App not found: ${params.appId}`);
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
