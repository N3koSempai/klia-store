import {
	Box,
	Card,
	CardContent,
	Skeleton,
	Typography,
} from "@mui/material";
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
		<Box sx={{ mb: 4 }}>
			<Typography variant="h5" gutterBottom>
				{t("home.appsOfTheWeek")}
			</Typography>

			{error && (
				<Typography color="error">
					{t("home.errorLoadingApps", { error: error.message })}
				</Typography>
			)}

			<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
				{isLoading || !data
					? Array.from(new Array(6)).map((_) => (
							<Box key={uuidv4()} sx={{ flex: "0 0 auto" }}>
								<Card
									sx={{
										height: 240,
										minWidth: 200,
										maxWidth: 250,
										display: "flex",
										flexDirection: "column",
									}}
								>
									<Skeleton
										variant="rectangular"
										height={140}
										sx={{ flexShrink: 0 }}
									/>
									<CardContent
										sx={{
											flexGrow: 1,
											display: "flex",
											flexDirection: "column",
											justifyContent: "space-between",
										}}
									>
										<Skeleton variant="text" width="100%" />
										<Skeleton variant="text" width="40%" />
									</CardContent>
								</Card>
							</Box>
						))
					: [
							...data.map((app) => (
								<Box key={app.app_id} sx={{ flex: "0 0 auto" }}>
									<Card
										onClick={() => app.appStream && onAppSelect(app.appStream)}
										sx={{
											cursor: "pointer",
											"&:hover": { boxShadow: 3 },
											height: 240,
											minWidth: 200,
											maxWidth: 250,
											display: "flex",
											flexDirection: "column",
										}}
									>
										<Box
											key={app.app_id}
											sx={{
												height: 140,
												bgcolor: "grey.700",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0,
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
										<CardContent
											sx={{
												flexGrow: 1,
												display: "flex",
												flexDirection: "column",
												gap: 0.5,
											}}
										>
											<Typography
												variant="body2"
												fontWeight="bold"
												noWrap
												title={app.name || app.app_id}
											>
												{app.name || app.app_id}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
												sx={{
													display: "-webkit-box",
													WebkitLineClamp: 2,
													WebkitBoxOrient: "vertical",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
											>
												{app.summary || t("home.noDescription")}
											</Typography>
										</CardContent>
									</Card>
								</Box>
							)),
							// Promoted card
							<Box key="promoted" sx={{ flex: "0 0 auto" }}>
								<Card
									sx={{
										height: 240,
										minWidth: 200,
										maxWidth: 250,
										display: "flex",
										flexDirection: "column",
										border: "2px dashed",
										borderColor: "primary.main",
										bgcolor: "background.paper",
									}}
								>
									<Box
										sx={{
											height: 140,
											bgcolor: "grey.100",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										<Typography
											variant="h3"
											color="primary.main"
											sx={{ opacity: 0.3 }}
										>
											+
										</Typography>
									</Box>
									<CardContent
										sx={{
											flexGrow: 1,
											display: "flex",
											flexDirection: "column",
											justifyContent: "center",
											textAlign: "center",
										}}
									>
										<Typography variant="body2" color="text.secondary">
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
									</CardContent>
								</Card>
							</Box>,
						]}
			</Box>
		</Box>
	);
};
