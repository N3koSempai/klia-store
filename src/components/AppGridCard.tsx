import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { CategoryApp } from "../types";
import { CachedImage } from "./CachedImage";

interface AppGridCardProps {
	app: CategoryApp;
	onClick: (app: CategoryApp) => void;
}

export const AppGridCard = ({ app, onClick }: AppGridCardProps) => {
	const { t } = useTranslation();

	return (
		<Box sx={{ minWidth: 0 }}>
			<Card
				sx={{
					bgcolor: "background.paper",
					borderRadius: "12px",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					transition: "all 0.3s ease-in-out",
					boxSizing: "border-box",
					minWidth: 0,
					overflow: "hidden",
					cursor: "pointer",
					willChange: "transform, box-shadow, border-color",
					"&:hover": {
						transform: "translateY(-5px)",
						borderColor: "primary.main",
						boxShadow: "0 8px 24px -4px rgba(0,0,0,0.6)",
						zIndex: 1,
					},
				}}
				onClick={() => onClick(app)}
			>
				<Box
					sx={{
						height: "100%",
						display: "flex",
						flexDirection: "column",
					}}
				>
					{/* App icon and name section - wider than tall */}
					<Box
						sx={{
							p: 2,
							display: "flex",
							alignItems: "center",
							gap: 2,
							minHeight: 100,
							width: "100%",
						}}
					>
						{/* Icon */}
						<Box
							sx={{
								width: 64,
								height: 64,
								flexShrink: 0,
								borderRadius: 2,
								overflow: "hidden",
								bgcolor: "transparent",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{app.icon ? (
								// Los iconos empaquetados (apps off-Flathub) no son URLs remotas:
								// CachedImage intentaría descargarlos y fallaría.
								app.icon.startsWith("http") ? (
									<CachedImage
										appId={app.app_id}
										imageUrl={app.icon}
										alt={app.name}
										variant="rounded"
										style={{
											width: "100%",
											height: "100%",
											objectFit: "cover",
										}}
									/>
								) : (
									<img
										src={app.icon}
										alt={app.name}
										style={{
											width: "100%",
											height: "100%",
											objectFit: "contain",
										}}
									/>
								)
							) : (
								<Typography variant="caption" sx={{ color: "text.secondary" }}>
									{t("home.noIcon")}
								</Typography>
							)}
						</Box>

						{/* Name and developer */}
						<Box sx={{ flexGrow: 1, minWidth: 0 }}>
							<Typography
								variant="body1"
								sx={{
									fontFamily: '"IBM Plex Sans", sans-serif',
									fontWeight: 600,
									color: "text.primary",
									mb: 0.5,
								}}
								noWrap
							>
								{app.name}
							</Typography>
							<Typography
								variant="caption"
								sx={{
									fontFamily: '"Inter", sans-serif',
									color: "text.secondary",
								}}
								noWrap
							>
								{app.developer_name}
							</Typography>
						</Box>
					</Box>

					{/* Summary section */}
					<CardContent sx={{ flexGrow: 1, pt: 1, width: "100%" }}>
						<Typography
							variant="body2"
							sx={{
								fontFamily: '"Inter", sans-serif',
								color: "text.secondary",
								display: "-webkit-box",
								WebkitLineClamp: 2,
								WebkitBoxOrient: "vertical",
								overflow: "hidden",
								minHeight: "2.5em",
							}}
						>
							{app.summary}
						</Typography>
					</CardContent>
				</Box>
			</Card>
		</Box>
	);
};

export const AppGridCardSkeleton = () => (
	<Box>
		<Card
			sx={{
				bgcolor: "background.paper",
				borderRadius: "12px",
				border: "1px solid rgba(255, 255, 255, 0.1)",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				boxSizing: "border-box",
			}}
		>
			{/* Skeleton for icon and name section */}
			<Box
				sx={{
					p: 2,
					display: "flex",
					gap: 2,
					minHeight: 100,
					alignItems: "center",
				}}
			>
				<Skeleton
					variant="rectangular"
					width={64}
					height={64}
					sx={{
						borderRadius: 2,
						flexShrink: 0,
						bgcolor: "rgba(255,255,255,0.1)",
					}}
				/>
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					<Skeleton
						variant="text"
						sx={{ mb: 0.5, bgcolor: "rgba(255,255,255,0.1)" }}
					/>
					<Skeleton
						variant="text"
						width="50%"
						sx={{ bgcolor: "rgba(255,255,255,0.1)" }}
					/>
				</Box>
			</Box>
			{/* Skeleton for summary */}
			<CardContent sx={{ flexGrow: 1, pt: 1 }}>
				<Skeleton variant="text" sx={{ bgcolor: "rgba(255,255,255,0.1)" }} />
				<Skeleton
					variant="text"
					width="90%"
					sx={{ bgcolor: "rgba(255,255,255,0.1)" }}
				/>
			</CardContent>
		</Card>
	</Box>
);

export const APP_GRID_SX = {
	display: "grid",
	gridTemplateColumns: {
		xs: "1fr",
		sm: "repeat(2, 1fr)",
		md: "repeat(3, 1fr)",
		lg: "repeat(4, 1fr)",
	},
	gap: 2,
	width: "100%",
	boxSizing: "border-box",
} as const;
