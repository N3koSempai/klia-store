import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";

const Analytics = lazy(() =>
	import("../../pages/analytics/Analytics").then((m) => ({
		default: m.Analytics,
	})),
);

export const Route = createFileRoute("/_layout/analytics")({
	component: AnalyticsRoute,
});

function AnalyticsRoute() {
	const navigate = useNavigate();

	const handleBack = () => {
		navigate({ to: "/" });
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
			<Analytics onBack={handleBack} />
		</Suspense>
	);
}
