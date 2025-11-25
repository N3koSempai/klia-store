import {
	Box,
	Card,
	CardContent,
	Chip,
	Grid,
	Skeleton,
	Typography,
	alpha,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CachedImage } from "../../../components/CachedImage";
import { useAppOfTheDay } from "../../../hooks/useAppOfTheDay";
import type { AppStream } from "../../../types";

interface FeaturedSectionProps {
	onAppSelect: (app: AppStream) => void;
}

// Promoted app card component (disabled by default)
interface PromotedAppCardData {
	appId: string;
	name: string;
	summary: string;
	icon: string;
	appStream: AppStream;
}

// Set to null to disable promoted app
const PROMOTED_APP: PromotedAppCardData | null = null;

export const FeaturedSection = ({ onAppSelect }: FeaturedSectionProps) => {
	const { t } = useTranslation();
	const { data: appOfTheDay, isLoading, error } = useAppOfTheDay();

	// Carousel state - includes backend app and optional promoted app
	const [activeSlide, setActiveSlide] = useState(0);

	// Build slides array
	const slides = [];
	if (appOfTheDay) slides.push({ type: 'backend' as const, data: appOfTheDay });
	if (PROMOTED_APP) slides.push({ type: 'promoted' as const, data: PROMOTED_APP });

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
						<Grid container spacing={4} alignItems="center">
							<Grid item>
								<Skeleton variant="rectangular" width={140} height={140} sx={{ borderRadius: 3 }} />
							</Grid>
							<Grid item xs>
								<Skeleton variant="text" width="30%" height={24} sx={{ mb: 2 }} />
								<Skeleton variant="text" width="70%" height={48} sx={{ mb: 2 }} />
								<Skeleton variant="text" width="90%" />
								<Skeleton variant="text" width="85%" />
							</Grid>
						</Grid>
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
						position: 'relative',
						overflow: 'hidden',
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
						}
					}}
					onClick={() => {
						const appStream = currentSlide.type === 'backend'
							? currentSlide.data.appStream
							: currentSlide.data.appStream;
						if (appStream) onAppSelect(appStream);
					}}
				>
					<Box sx={{ p: 5 }}>
						<Grid container spacing={4} alignItems="center">
							{/* Image / Icon */}
							<Grid item>
								<Box
									key={currentSlide.type === 'backend' ? currentSlide.data.app_id : currentSlide.data.appId}
									sx={{
										width: 140,
										height: 140,
										bgcolor: "#21262d",
										borderRadius: 3,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
										overflow: 'hidden'
									}}
								>
									<CachedImage
										appId={currentSlide.type === 'backend' ? currentSlide.data.app_id : currentSlide.data.appId}
										imageUrl={currentSlide.type === 'backend' ? currentSlide.data.icon : currentSlide.data.icon}
										alt={currentSlide.type === 'backend' ? (currentSlide.data.name || currentSlide.data.app_id) : currentSlide.data.name}
										style={{
											width: "100%",
											height: "100%",
											objectFit: "contain",
										}}
									/>
								</Box>
							</Grid>

							{/* Text */}
							<Grid item xs>
								<Chip
									label={currentSlide.type === 'backend' ? t("home.appOfTheDay").toUpperCase() : "PROMOTED"}
									sx={{
										bgcolor: alpha("#4A86CF", 0.15),
										color: "primary.main",
										fontWeight: 800,
										fontSize: '0.7rem',
										mb: 2,
										borderRadius: 1
									}}
								/>
								<Typography variant="h3" sx={{ fontFamily: 'IBM Plex Sans', fontWeight: 700, mb: 1, letterSpacing: '-0.5px' }}>
									{currentSlide.type === 'backend'
										? (currentSlide.data.name || currentSlide.data.app_id)
										: currentSlide.data.name
									}
								</Typography>
								<Typography variant="h6" sx={{ color: "text.secondary", fontWeight: 400, lineHeight: 1.5, maxWidth: '80%' }}>
									{currentSlide.type === 'backend'
										? currentSlide.data.appStream?.summary
										: currentSlide.data.summary
									}
								</Typography>
							</Grid>
						</Grid>
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
								bgcolor: activeSlide === index ? "primary.main" : "action.disabled",
								cursor: "pointer",
								transition: "background-color 0.3s",
								"&:hover": {
									bgcolor: activeSlide === index ? "primary.dark" : "action.hover",
								},
							}}
						/>
					))}
				</Box>
			)}
		</Box>
	);
};
