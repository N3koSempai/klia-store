import { alpha, Box, Card, Chip, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CachedImage } from "../../../components/CachedImage";
import { useAppOfTheDay } from "../../../hooks/useAppOfTheDay";
import { apiService } from "../../../services/api";
import type { CategoryApp } from "../../../types";
import hetairosLogo from "../../../assets/internalPromo/hentairos_logo.png";

interface FeaturedSectionProps {
	onAppSelect: (app: CategoryApp) => void;
}


// Promoted app card component (disabled by default)
interface PromotedAppCardData {
	appId: string;
	name: string;
	summary: string;
	icon: string;
	categoryApp?: CategoryApp;
}

// Set to null to disable promoted app
const PROMOTED_APP_ID = "io.github.N3kosempai.hetairos-ai";

export const FeaturedSection = ({ onAppSelect }: FeaturedSectionProps) => {
	const { t } = useTranslation();
	const { data: appOfTheDay, isLoading, error } = useAppOfTheDay();

	// Fetch promoted app with React Query (cached)
	const { data: promotedApp } = useQuery({
		queryKey: ["promotedApp", PROMOTED_APP_ID],
		queryFn: async () => {
			if (!PROMOTED_APP_ID) return null;

			const categoryApp = await apiService.getCategoryApp(PROMOTED_APP_ID);
			if (!categoryApp) return null;

			return {
				appId: PROMOTED_APP_ID,
				name: categoryApp.name,
				summary: categoryApp.summary,
				icon: hetairosLogo,
				categoryApp: categoryApp,
			} as PromotedAppCardData;
		},
		enabled: !!PROMOTED_APP_ID,
		staleTime: Infinity, // Never refetch, keep in cache
		gcTime: Infinity, // Never garbage collect
	});

	// Carousel state - includes backend app and optional promoted app
	const [activeSlide, setActiveSlide] = useState(0);

	// Build slides array
	type BackendSlide = { type: "backend"; data: typeof appOfTheDay };
	type PromotedSlide = { type: "promoted"; data: PromotedAppCardData };
	type Slide = BackendSlide | PromotedSlide;

	const slides: Slide[] = [];
	if (promotedApp) slides.push({ type: "promoted", data: promotedApp });
	if (appOfTheDay) slides.push({ type: "backend", data: appOfTheDay });

	const totalSlides = slides.length;

	if (isLoading) {
		return (
			<Box sx={{ mb: 6 }}>
				<Card
					sx={{
						borderRadius: 4,
						overflow: "hidden",
						border: "1px solid rgba(255,255,255,0.1)",
					}}
				>
					<Box sx={{ p: 5 }}>
						<Box sx={{ display: "flex", gap: 4, alignItems: "center" }}>
							<Box>
								<Skeleton
									variant="rectangular"
									width={140}
									height={140}
									sx={{ borderRadius: 3 }}
								/>
							</Box>
							<Box sx={{ flexGrow: 1 }}>
								<Skeleton
									variant="text"
									width="30%"
									height={24}
									sx={{ mb: 2 }}
								/>
								<Skeleton
									variant="text"
									width="70%"
									height={48}
									sx={{ mb: 2 }}
								/>
								<Skeleton variant="text" width="90%" />
								<Skeleton variant="text" width="85%" />
							</Box>
						</Box>
					</Box>
				</Card>
			</Box>
		);
	}

	if (error) {
		return (
			<Box sx={{ mb: 6 }}>
				<Box
					sx={{
						height: 300,
						bgcolor: "background.paper",
						borderRadius: 4,
						border: "1px solid rgba(255,255,255,0.1)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Typography variant="body1" color="error">
						{t("home.errorLoadingApp")}
					</Typography>
				</Box>
			</Box>
		);
	}

	const currentSlide = slides[activeSlide];

	return (
		<Box sx={{ mb: 6 }}>
			{/* Hero Card */}
			{currentSlide && (
				<Card
					sx={{
						position: "relative",
						overflow: "hidden",
						bgcolor: "background.paper",
						border: "1px solid rgba(255,255,255,0.1)",
						borderRadius: 4,
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
					onClick={() => {
						if (currentSlide.type === "backend" && currentSlide.data?.categoryApp) {
							onAppSelect(currentSlide.data.categoryApp);
						} else if (currentSlide.type === "promoted" && currentSlide.data.categoryApp) {
							onAppSelect(currentSlide.data.categoryApp);
						}
					}}
				>
					<Box sx={{ p: 5 }}>
						<Box sx={{ display: "flex", gap: 4, alignItems: "center" }}>
							{/* Image / Icon */}
							<Box>
								<Box
									key={
										currentSlide.type === "backend"
											? currentSlide.data?.app_id
											: currentSlide.data.appId
									}
									sx={{
										width: 140,
										height: 140,
										bgcolor: "#21262d",
										borderRadius: 3,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
										overflow: "hidden",
									}}
								>
									{currentSlide.type === "promoted" ? (
										<img
											src={currentSlide.data.icon}
											alt={currentSlide.data.name}
											style={{
												width: "100%",
												height: "100%",
												objectFit: "contain",
											}}
										/>
									) : (
										<CachedImage
											appId={currentSlide.data?.app_id || ""}
											imageUrl={currentSlide.data?.icon || ""}
											alt={
												currentSlide.data?.name ||
												currentSlide.data?.app_id ||
												""
											}
											style={{
												width: "100%",
												height: "100%",
												objectFit: "contain",
											}}
										/>
									)}
								</Box>
							</Box>

							{/* Text */}
							<Box sx={{ flexGrow: 1 }}>
								<Chip
									label={
										currentSlide.type === "backend"
											? t("home.appOfTheDay").toUpperCase()
											: t("home.promoted").toUpperCase()
									}
									sx={{
										bgcolor: alpha("#4A86CF", 0.15),
										color: "primary.main",
										fontWeight: 800,
										fontSize: "0.7rem",
										mb: 2,
										borderRadius: 1,
									}}
								/>
								<Typography
									variant="h3"
									sx={{
										fontFamily: "IBM Plex Sans",
										fontWeight: 700,
										mb: 1,
										letterSpacing: "-0.5px",
									}}
								>
									{currentSlide.type === "backend"
										? currentSlide.data?.name || currentSlide.data?.app_id || ""
										: currentSlide.data.name}
								</Typography>
								<Typography
									variant="h6"
									sx={{
										color: "text.secondary",
										fontWeight: 400,
										lineHeight: 1.5,
										maxWidth: "80%",
									}}
								>
									{currentSlide.type === "backend"
										? currentSlide.data?.appStream?.summary
										: currentSlide.data.summary}
								</Typography>
							</Box>
						</Box>
					</Box>
				</Card>
			)}

			{/* Carousel dots navigation */}
			{totalSlides > 1 && (
				<Box
					sx={{
						display: "flex",
						justifyContent: "center",
						gap: 1,
						mt: 2,
					}}
				>
					{slides.map((_, index) => (
						<Box
							key={index}
							onClick={() => setActiveSlide(index)}
							sx={{
								width: 10,
								height: 10,
								borderRadius: "50%",
								bgcolor:
									activeSlide === index ? "primary.main" : "action.disabled",
								cursor: "pointer",
								transition: "background-color 0.3s",
								"&:hover": {
									bgcolor:
										activeSlide === index ? "primary.dark" : "action.hover",
								},
							}}
						/>
					))}
				</Box>
			)}
		</Box>
	);
};
