import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";
import type { CategoryApp } from "../../types";

const CategoryApps = lazy(() =>
	import("../../pages/categoryApps/CategoryApps").then((m) => ({
		default: m.CategoryApps,
	})),
);

export const Route = createFileRoute("/_layout/category/$categoryId")({
	component: CategoryRoute,
});

function CategoryRoute() {
	const { categoryId } = Route.useParams();
	const navigate = useNavigate();

	const handleBack = () => {
		navigate({ to: "/" });
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
			<CategoryApps
				categoryId={categoryId}
				onBack={handleBack}
				onAppSelect={handleAppSelect}
			/>
		</Suspense>
	);
}
