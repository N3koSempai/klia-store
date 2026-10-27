import ArrowBack from "@mui/icons-material/ArrowBack";
import { alpha, Box, IconButton, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import kliaAnimation from "../../assets/animations/klia_static.svg";
import {
	APP_GRID_SX,
	AppGridCard,
	AppGridCardSkeleton,
} from "../../components/AppGridCard";
import { KLIA_APP_IDS } from "../../data/kliaApps";
import { useKliaApps } from "../../hooks/useKliaApps";
import type { CategoryApp } from "../../types";

interface KliaProps {
	onBack: () => void;
	onAppSelect: (app: CategoryApp) => void;
}

export const Klia = ({ onBack, onAppSelect }: KliaProps) => {
	const { t } = useTranslation();
	const { apps, isLoading } = useKliaApps();

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
			<IconButton
				onClick={onBack}
				aria-label={t("klia.back")}
				sx={{
					color: "text.primary",
					mb: 2,
					"&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
				}}
			>
				<ArrowBack fontSize="large" />
			</IconButton>

			{/* Cabecera de marca */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: { xs: 2, md: 4 },
					flexDirection: { xs: "column", md: "row" },
					textAlign: { xs: "center", md: "left" },
					p: { xs: 3, md: 5 },
					mb: 5,
					borderRadius: "16px",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					background: (theme) =>
						`radial-gradient(circle at 15% 20%, ${alpha(theme.palette.primary.main, 0.18)}, transparent 55%), ${theme.palette.background.paper}`,
				}}
			>
				<Box
					component="img"
					src={kliaAnimation}
					alt=""
					sx={{ width: 120, height: 120, flexShrink: 0 }}
				/>
				<Box sx={{ minWidth: 0 }}>
					<Typography
						variant="h3"
						component="h1"
						sx={{
							fontFamily: '"IBM Plex Sans", sans-serif',
							fontWeight: 700,
							color: "text.primary",
							mb: 1,
						}}
					>
						{t("klia.title")}
					</Typography>
					<Typography
						variant="h6"
						sx={{
							fontWeight: 400,
							color: "text.secondary",
							maxWidth: 640,
						}}
					>
						{t("klia.tagline")}
					</Typography>
				</Box>
			</Box>

			{/* Listado de apps */}
			<Box sx={APP_GRID_SX}>
				{isLoading
					? KLIA_APP_IDS.map((id) => <AppGridCardSkeleton key={id} />)
					: apps.map((app) => (
							<AppGridCard key={app.app_id} app={app} onClick={onAppSelect} />
						))}
			</Box>
		</Box>
	);
};
