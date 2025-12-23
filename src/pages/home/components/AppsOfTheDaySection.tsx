import { alpha, Box, Paper, Skeleton, Typography } from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { CachedImage } from "../../../components/CachedImage";
import { useAppsOfTheWeek } from "../../../hooks/useAppsOfTheWeek";
import type { AppStream } from "../../../types";

interface AppsOfTheDaySectionProps {
	onAppSelect: (app: AppStream) => void;
}

export const AppsOfTheDaySection = ({
	onAppSelect,
}: AppsOfTheDaySectionProps) => {
	const { t } = useTranslation();
	const { data, isLoading, error } = useAppsOfTheWeek();

	const handleContactClick = async () => {
		try {
			// Try to open email client with mailto link
			await openUrl("mailto:me@nekosempai.addy.io");
		} catch (error) {
			console.error("Error opening email client:", error);
		}
	};

	return (
		<Box sx={{ mb: 6 }}>
			<Typography
				variant="h5"
				sx={{ mb: 3, fontFamily: "IBM Plex Sans", fontWeight: 600 }}
			>
				{t("home.appsOfTheWeek")}
			</Typography>

			{error && (
				<Typography color="error">
					{t("home.errorLoadingApps", { error: error.message })}
				</Typography>
			)}

			<Box
				sx={{
					display: "flex",
					gap: 2,
					overflowX: "auto",
					pb: 2,
					px: 1,
					py: 1,
					"&::-webkit-scrollbar": { height: 6 },
					"&::-webkit-scrollbar-track": { bgcolor: "transparent" },
					"&::-webkit-scrollbar-thumb": {
						bgcolor: "rgba(255,255,255,0.1)",
						borderRadius: 3,
					},
					"&::-webkit-scrollbar-thumb:hover": {
						bgcolor: "rgba(255,255,255,0.2)",
					},
				}}
			>
				{isLoading || !data
					? Array.from(new Array(6)).map((_) => (
							<Paper
								key={uuidv4()}
								elevation={0}
								sx={{
									minWidth: 200,
									maxWidth: 200,
									bgcolor: "background.paper",
									border: "1px solid rgba(255,255,255,0.1)",
									borderRadius: 3,
								}}
							>
								<Box
									sx={{
										p: 3,
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
									}}
								>
									<Skeleton
										variant="rectangular"
										width={72}
										height={72}
										sx={{ borderRadius: 2, mb: 2 }}
									/>
									<Skeleton
										variant="text"
										width="80%"
										height={24}
										sx={{ mb: 1 }}
									/>
									<Skeleton variant="text" width="100%" />
									<Skeleton variant="text" width="90%" />
								</Box>
							</Paper>
						))
					: [
							...data.map((app) => (
								<Paper
									key={app.app_id}
									elevation={0}
									sx={{
										minWidth: 200,
										maxWidth: 200,
										bgcolor: "background.paper",
										border: "1px solid rgba(255,255,255,0.1)",
										borderRadius: 3,
										transition: "all 0.3s ease-in-out",
										cursor: "pointer",
										willChange: "transform, box-shadow, border-color",
										"&:hover": {
											transform: "translateY(-5px)",
											borderColor: "primary.main",
											boxShadow: "0 8px 24px -4px rgba(0,0,0,0.6)",
											zIndex: 1,
										},
									}}
									onClick={() => app.appStream && onAppSelect(app.appStream)}
								>
									<Box
										sx={{
											p: 3,
											height: "100%",
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											textAlign: "center",
										}}
									>
										<Box
											sx={{
												width: 72,
												height: 72,
												bgcolor: "#21262d",
												borderRadius: 2,
												mb: 2,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												overflow: "hidden",
											}}
										>
											{app.icon ? (
												<CachedImage
													appId={app.app_id}
													imageUrl={app.icon}
													alt={app.name || app.app_id}
													style={{
														width: "100%",
														height: "100%",
														objectFit: "contain",
													}}
												/>
											) : (
												<Typography variant="caption" color="text.secondary">
													{t("home.noImage")}
												</Typography>
											)}
										</Box>
										<Typography
											variant="h6"
											sx={{
												fontFamily: "IBM Plex Sans",
												fontWeight: 700,
												mb: 1,
												fontSize: "1.1rem",
											}}
										>
											{app.name || app.app_id}
										</Typography>
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ lineHeight: 1.3, fontSize: "0.85rem" }}
										>
											{app.summary || t("home.noDescription")}
										</Typography>
									</Box>
								</Paper>
							)),
							// Promoted card
							<Paper
								key="promoted"
								elevation={0}
								sx={{
									minWidth: 200,
									maxWidth: 200,
									bgcolor: "background.paper",
									border: "2px dashed",
									borderColor: "primary.main",
									borderRadius: 3,
								}}
							>
								<Box
									sx={{
										p: 3,
										height: "100%",
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										justifyContent: "center",
										textAlign: "center",
									}}
								>
									<Box
										sx={{
											width: 72,
											height: 72,
											bgcolor: alpha("#4A86CF", 0.1),
											borderRadius: 2,
											mb: 2,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Typography
											variant="h3"
											color="primary.main"
											sx={{ opacity: 0.5 }}
										>
											+
										</Typography>
									</Box>
									<Typography
										variant="body2"
										color="text.secondary"
										sx={{ mb: 1 }}
									>
										{t("home.wantYourAppHere")}
									</Typography>
									<Box
										component="button"
										onClick={handleContactClick}
										sx={{
											color: "primary.main",
											textDecoration: "none",
											"&:hover": { textDecoration: "underline" },
											cursor: "pointer",
											border: "none",
											background: "transparent",
											padding: 0,
											font: "inherit",
											fontSize: "0.875rem",
											boxShadow: "none",
											"&:focus": { outline: "none", boxShadow: "none" },
											"&:active": { boxShadow: "none" },
										}}
									>
										{t("home.contactUs")}
									</Box>
								</Box>
							</Paper>,
						]}
			</Box>
		</Box>
	);
};
