import ArrowBack from "@mui/icons-material/ArrowBack";
import { Box, IconButton, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
	APP_GRID_SX,
	AppGridCard,
	AppGridCardSkeleton,
} from "../../components/AppGridCard";
import { useCategoryApps } from "../../hooks/useCategoryApps";
import type { CategoryApp } from "../../types";

interface CategoryAppsProps {
	categoryId: string;
	onBack: () => void;
	onAppSelect: (app: CategoryApp) => void;
}

export const CategoryApps = ({
	categoryId,
	onBack,
	onAppSelect,
}: CategoryAppsProps) => {
	const { t } = useTranslation();
	const { data, isLoading, error } = useCategoryApps(categoryId);

	const handleAppClick = (categoryApp: CategoryApp) => {
		onAppSelect(categoryApp);
	};

	return (
		<Box
			sx={{
				width: "100%",
				minHeight: "100vh",
				bgcolor: "#0D1117",
				p: 4,
				fontFamily: '"Inter", sans-serif',
			}}
		>
			{/* Header with back button */}
			<Box sx={{ display: "flex", alignItems: "center", mb: 4 }}>
				<IconButton
					onClick={onBack}
					sx={{
						color: "text.primary",
						mr: 2,
						"&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
					}}
				>
					<ArrowBack fontSize="large" />
				</IconButton>
				<Typography
					variant="h4"
					sx={{
						fontFamily: '"IBM Plex Sans", sans-serif',
						fontWeight: 700,
						color: "text.primary",
						textTransform: "capitalize",
					}}
				>
					{categoryId.replace(/([A-Z])/g, " $1").trim()}
				</Typography>
			</Box>

			{error && (
				<Typography color="error">
					{t("categoryApps.errorLoadingApps", { error: error.message })}
				</Typography>
			)}

			{/* Apps grid */}
			<Box sx={APP_GRID_SX}>
				{isLoading
					? Array.from(new Array(12)).map((_, index) => (
							<AppGridCardSkeleton key={`skeleton-${index}`} />
						))
					: data?.hits.map((app) => (
							<AppGridCard
								key={app.app_id}
								app={app}
								onClick={handleAppClick}
							/>
						))}
			</Box>

			{/* No results message */}
			{!isLoading && data?.hits.length === 0 && (
				<Box sx={{ textAlign: "center", py: 8 }}>
					<Typography variant="h6" color="text.secondary">
						{t("categoryApps.noApps")}
					</Typography>
				</Box>
			)}
		</Box>
	);
};
