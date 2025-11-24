import {
	Box,
	Card,
	CardContent,
	Skeleton,
	Typography,
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
			<Box sx={{ mb: 4 }}>
				<Typography variant="h5" gutterBottom>
					Spotlight
				</Typography>
				<Card
					sx={{
						height: 300,
						borderRadius: 2,
						display: "flex",
						overflow: "hidden",
					}}
				>
					<Skeleton
						variant="rectangular"
						width={200}
						height={300}
						sx={{ flexShrink: 0 }}
					/>
					<CardContent
						sx={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
						}}
					>
						<Skeleton variant="text" width="30%" height={24} sx={{ mb: 1 }} />
						<Skeleton variant="text" width="70%" height={48} sx={{ mb: 2 }} />
						<Skeleton variant="text" width="90%" />
						<Skeleton variant="text" width="85%" />
					</CardContent>
				</Card>
			</Box>
		);
	}

	if (error) {
		return (
			<Box sx={{ mb: 4 }}>
				<Typography variant="h5" gutterBottom>
					Spotlight
				</Typography>
				<Box
					sx={{
						height: 300,
						bgcolor: "grey.200",
						borderRadius: 2,
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
		<Box sx={{ mb: 4 }}>
			<Typography variant="h5" gutterBottom>
				Spotlight
			</Typography>

			{/* Carousel Card */}
			{currentSlide && (
				<Card
					onClick={() => {
						const appStream = currentSlide.type === 'backend'
							? currentSlide.data.appStream
							: currentSlide.data.appStream;
						if (appStream) onAppSelect(appStream);
					}}
					sx={{
						height: 300,
						borderRadius: 2,
						display: "flex",
						position: "relative",
						overflow: "hidden",
						cursor: "pointer",
						"&:hover": { boxShadow: 3 },
					}}
				>
					{/* Image section with key to force remount on slide change */}
					<Box
						key={currentSlide.type === 'backend' ? currentSlide.data.app_id : currentSlide.data.appId}
						sx={{
							width: 200,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							p: 2,
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

					<CardContent
						sx={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
						}}
					>
						<Typography variant="overline" color="primary" gutterBottom>
							{currentSlide.type === 'backend' ? t("home.appOfTheDay") : "Promoted"}
						</Typography>
						<Typography variant="h4" component="div" gutterBottom>
							{currentSlide.type === 'backend'
								? (currentSlide.data.name || currentSlide.data.app_id)
								: currentSlide.data.name
							}
						</Typography>
						<Typography variant="body1" color="text.secondary">
							{currentSlide.type === 'backend'
								? currentSlide.data.appStream?.summary
								: currentSlide.data.summary
							}
						</Typography>
					</CardContent>
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
