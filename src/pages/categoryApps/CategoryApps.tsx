import { ArrowBack } from "@mui/icons-material";
import {
	Box,
	Card,
	CardContent,
	IconButton,
	Skeleton,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { CachedImage } from "../../components/CachedImage";
import { useCategoryApps } from "../../hooks/useCategoryApps";
import type { AppStream, CategoryApp } from "../../types";

interface CategoryAppsProps {
	categoryId: string;
	onBack: () => void;
	onAppSelect: (app: AppStream) => void;
}

export const CategoryApps = ({
	categoryId,
	onBack,
	onAppSelect,
}: CategoryAppsProps) => {
	const { t } = useTranslation();
	const { data, isLoading, error } = useCategoryApps(categoryId);

	const handleAppClick = (categoryApp: CategoryApp) => {
		// Transform CategoryApp to AppStream format expected by AppDetails
		const appStream: AppStream = {
			id: categoryApp.app_id,
			name: categoryApp.name,
			summary: categoryApp.summary,
			description: categoryApp.description,
			icon: categoryApp.icon,
		};
		onAppSelect(appStream);
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
						color: "#C9D1D9",
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
						color: "#C9D1D9",
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
			<Box
				sx={{
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
				}}
			>
				{isLoading
					? Array.from(new Array(12)).map(() => (
							<Box key={uuidv4()}>
								<Card
									sx={{
										bgcolor: "#161B22",
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
											sx={{ borderRadius: 2, flexShrink: 0, bgcolor: "rgba(255,255,255,0.1)" }}
										/>
										<Box sx={{ flexGrow: 1, minWidth: 0 }}>
											<Skeleton variant="text" sx={{ mb: 0.5, bgcolor: "rgba(255,255,255,0.1)" }} />
											<Skeleton variant="text" width="50%" sx={{ bgcolor: "rgba(255,255,255,0.1)" }} />
										</Box>
									</Box>
									{/* Skeleton for summary */}
									<CardContent sx={{ flexGrow: 1, pt: 1 }}>
										<Skeleton variant="text" sx={{ bgcolor: "rgba(255,255,255,0.1)" }} />
										<Skeleton variant="text" width="90%" sx={{ bgcolor: "rgba(255,255,255,0.1)" }} />
									</CardContent>
								</Card>
							</Box>
						))
					: data?.hits.map((app) => (
							<Box key={app.app_id} sx={{ minWidth: 0 }}>
								<Card
									sx={{
										bgcolor: "#161B22",
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
											borderColor: "#4A86CF",
											boxShadow: "0 8px 24px -4px rgba(0,0,0,0.6)",
											zIndex: 1,
										},
									}}
									onClick={() => handleAppClick(app)}
								>
									<Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
													<Typography variant="caption" sx={{ color: "#8B949E" }}>
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
														color: "#C9D1D9",
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
														color: "#8B949E",
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
													color: "#8B949E",
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
