import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";
import type { CategoryApp } from "../../types";

const DeveloperProfile = lazy(() =>
	import("../../pages/developerProfile/DeveloperProfile").then((m) => ({
		default: m.DeveloperProfile,
	})),
);

interface DeveloperSearch {
	developerName?: string;
	developerAppId?: string;
}

export const Route = createFileRoute("/_layout/developer/$developerId")({
	validateSearch: (search: Record<string, unknown>): DeveloperSearch => ({
		developerName: search.developerName as string | undefined,
		developerAppId: search.developerAppId as string | undefined,
	}),
	component: DeveloperRoute,
});

function DeveloperRoute() {
	const { developerId } = Route.useParams();
	const { developerName, developerAppId } = Route.useSearch();
	const navigate = useNavigate();

	const handleBack = () => {
		if (developerAppId) {
			navigate({
				to: "/app/$appId",
				params: { appId: developerAppId },
				search: { developerName, developerAppId },
			});
		} else {
			navigate({ to: "/" });
		}
	};

	const handleAppSelect = (
		app: CategoryApp,
		searchQuery?: string,
		searchResults?: CategoryApp[],
	) => {
		navigate({
			to: "/app/$appId",
			params: { appId: app.app_id },
			search: { searchQuery, searchResults },
		});
	};

	return (
		<Suspense
			fallback={
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
			}
		>
			<DeveloperProfile
				developerId={developerId}
				developerName={developerName || developerId}
				appId={developerAppId}
				onBack={handleBack}
				onAppSelect={handleAppSelect}
			/>
		</Suspense>
	);
}
