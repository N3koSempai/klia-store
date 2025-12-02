import { ArrowBack } from "@mui/icons-material";
import {
	Box,
	Card,
	CardContent,
	Chip,
	IconButton,
	Skeleton,
	Typography,
} from "@mui/material";
import React from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { CachedImage } from "../../components/CachedImage";
import { useDeveloperApps } from "../../hooks/useDeveloperApps";
import { apiService } from "../../services/api";
import type { AppStream, CategoryApp } from "../../types";

interface DeveloperProfileProps {
	developerId: string;
	developerName: string;
	appId?: string; // Optional: app_id to fallback if developer search fails
	onBack: () => void;
	onAppSelect: (app: AppStream) => void;
}

export const DeveloperProfile = ({
	developerId,
	developerName,
	appId,
	onBack,
	onAppSelect,
}: DeveloperProfileProps) => {
	const { t } = useTranslation();
	const [currentDeveloperId, setCurrentDeveloperId] =
		React.useState(developerId);
	const { data, isLoading, error } = useDeveloperApps(currentDeveloperId);
	const [isRetrying, setIsRetrying] = React.useState(false);
	const [hasRetried, setHasRetried] = React.useState(false);

	// If we got 0 apps, try to get the real developer_name from appstream
	React.useEffect(() => {
		const fetchRealDeveloperName = async () => {
			if (
				!isLoading &&
				!error &&
				data?.hits.length === 0 &&
				!isRetrying &&
				!hasRetried &&
				appId
			) {
				setIsRetrying(true);
				try {
					// Get the real developer_name from searching by app_id query
					const searchResult = await apiService.searchApps({
						query: appId,
						hits_per_page: 1,
					});
					if (searchResult.hits.length > 0) {
						const realName = searchResult.hits[0].developer_name;
						if (realName && realName !== currentDeveloperId) {
							console.log(
								`Retrying with real developer name: ${realName} (was ${currentDeveloperId})`,
							);
							setCurrentDeveloperId(realName);
						}
					}
				} catch (err) {
					console.error("Failed to fetch real developer name:", err);
				} finally {
					setIsRetrying(false);
					setHasRetried(true);
				}
			}
		};
		fetchRealDeveloperName();
	}, [data, isLoading, error, isRetrying, hasRetried, appId, currentDeveloperId]);

	// Show loading state while initial load or retrying
	const showLoading = isLoading || isRetrying;

	const handleAppClick = (categoryApp: CategoryApp) => {
		const appStream: AppStream = {
			id: categoryApp.app_id,
			name: categoryApp.name,
			summary: categoryApp.summary,
			description: categoryApp.description,
			icon: categoryApp.icon,
		};
		onAppSelect(appStream);
	};

	// Generate avatar initial from developer name
	const avatarInitial = developerName.charAt(0).toUpperCase();

	return (
		<Box
			sx={{
				width: "100%",
				minHeight: "100vh",
				bgcolor: "#0D1117",
				fontFamily: '"Inter", sans-serif',
			}}
		>
			{/* Hero Section - Developer Identity */}
			<Box
				sx={{
					bgcolor: "#161B22",
					borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
					p: 4,
				}}
			>
				{/* Back button */}
				<IconButton
					onClick={onBack}
					sx={{
						color: "#C9D1D9",
						mb: 3,
						"&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
					}}
				>
					<ArrowBack />
				</IconButton>

				{/* Developer identity */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
					{/* Avatar */}
					<Box
						sx={{
							width: 96,
							height: 96,
							borderRadius: 2,
							bgcolor: "rgba(74, 134, 207, 0.2)",
							border: "1px solid rgba(74, 134, 207, 0.3)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<Typography
							sx={{
								fontFamily: '"IBM Plex Sans", sans-serif',
								fontSize: "48px",
								fontWeight: 700,
								color: "#4A86CF",
							}}
						>
							{avatarInitial}
						</Typography>
					</Box>

					{/* Name and badge */}
					<Box>
						<Typography
							variant="h3"
							sx={{
								fontFamily: '"IBM Plex Sans", sans-serif',
								fontWeight: 700,
								color: "#C9D1D9",
								mb: 1,
							}}
						>
							{developerName}
						</Typography>

						{/* Package count badge */}
						<Chip
							label={
								showLoading
									? "..."
									: `${data?.hits.length || 0} ${
											data?.hits.length === 1 ? "Package" : "Packages"
										}`
							}
							sx={{
								fontFamily: '"JetBrains Mono", monospace',
								fontSize: "0.875rem",
								bgcolor: "rgba(74, 134, 207, 0.15)",
								color: "#4A86CF",
								border: "1px solid rgba(74, 134, 207, 0.3)",
								fontWeight: 600,
							}}
						/>
					</Box>
				</Box>
			</Box>

			{/* Apps Section */}
			<Box sx={{ p: 4 }}>
				{/* Section Title */}
				<Typography
					variant="h5"
					sx={{
						fontFamily: '"IBM Plex Sans", sans-serif',
						fontWeight: 700,
						color: "#C9D1D9",
						mb: 3,
					}}
				>
					Available Software
				</Typography>

				{error && (
					<Typography color="error">
						{t("developerProfile.errorLoadingApps", { error: error.message })}
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
					{showLoading
						? Array.from(new Array(8)).map(() => (
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
										<CardContent sx={{ flexGrow: 1, pt: 1 }}>
											<Skeleton
												variant="text"
												sx={{ bgcolor: "rgba(255,255,255,0.1)" }}
											/>
											<Skeleton
												variant="text"
												width="90%"
												sx={{ bgcolor: "rgba(255,255,255,0.1)" }}
											/>
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
										<Box
											sx={{ height: "100%", display: "flex", flexDirection: "column" }}
										>
											{/* App icon and name section */}
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

												{/* Name */}
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

				{/* No results message - only show after retry is complete */}
				{!showLoading && hasRetried && data?.hits.length === 0 && (
					<Box sx={{ textAlign: "center", py: 8 }}>
						<Typography variant="h6" sx={{ color: "#8B949E" }}>
							{t("developerProfile.noApps")}
						</Typography>
					</Box>
				)}
			</Box>
		</Box>
	);
};
