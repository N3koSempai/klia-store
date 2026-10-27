import { Box } from "@mui/material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import kliaAnimation from "../../assets/animations/klia.svg";
import type { CategoryApp } from "../../types";

const Klia = lazy(() =>
	import("../../pages/klia/Klia").then((m) => ({
		default: m.Klia,
	})),
);

export const Route = createFileRoute("/_layout/klia")({
	component: KliaRoute,
});

function KliaRoute() {
	const navigate = useNavigate();

	const handleBack = () => {
		navigate({ to: "/" });
	};

	const handleAppSelect = (app: CategoryApp) => {
		navigate({
			to: "/app/$appId",
			params: { appId: app.app_id },
			search: { selectedApp: app },
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
			<Klia onBack={handleBack} onAppSelect={handleAppSelect} />
		</Suspense>
	);
}
