import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import {
	Box,
	ButtonBase,
	IconButton,
	Skeleton,
	Typography,
} from "@mui/material";
import type { TFunction } from "i18next";
import { memo, useState } from "react";
import { CachedImage } from "../../../components/CachedImage";
import type { AppStream } from "../../../types";

interface ScreenshotCarouselProps {
	appId: string;
	screenshots: AppStream["screenshots"];
	screenshotIds: string[];
	isLoading: boolean;
	t: TFunction;
}

export const ScreenshotCarousel = memo(
	({
		appId,
		screenshots,
		screenshotIds,
		isLoading,
		t,
	}: ScreenshotCarouselProps) => {
		const [currentImageIndex, setCurrentImageIndex] = useState(0);

		const handlePrevImage = () => {
			if (screenshots && screenshots.length > 0) {
				setCurrentImageIndex((prev) =>
					prev === 0 ? screenshots.length - 1 : prev - 1,
				);
			}
		};

		const handleNextImage = () => {
			if (screenshots && screenshots.length > 0) {
				setCurrentImageIndex((prev) =>
					prev === screenshots.length - 1 ? 0 : prev + 1,
				);
			}
		};

		return (
			<>
				<Typography variant="h6" gutterBottom textAlign="center">
					{t("appDetails.screenshots")}
				</Typography>
				{isLoading ? (
					<Box
						sx={{
							position: "relative",
							width: "100%",
							maxWidth: 900,
							margin: "0 auto",
						}}
					>
						<Skeleton
							variant="rounded"
							sx={{
								width: "100%",
								height: 500,
							}}
							animation="wave"
						/>
					</Box>
				) : screenshots && screenshots.length > 0 ? (
					<Box
						sx={{
							position: "relative",
							width: "100%",
							maxWidth: 900,
							margin: "0 auto",
						}}
					>
						{/* Imagen actual */}
						<Box
							sx={{
								width: "100%",
								height: 500,
								bgcolor: "transparent",
								borderRadius: 2,
								overflow: "hidden",
								position: "relative",
							}}
						>
							{screenshots.map((screenshot, index) => {
								// Buscar el tamaño más grande o el primero disponible
								const largestSize = screenshot.sizes.reduce((prev, current) =>
									Number.parseInt(prev.width, 10) >
									Number.parseInt(current.width, 10)
										? prev
										: current,
								);
								return (
									<Box
										key={screenshotIds[index]}
										sx={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: "100%",
											display: index === currentImageIndex ? "flex" : "none",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<CachedImage
											appId={appId}
											imageUrl={largestSize.src}
											alt={`Screenshot ${index + 1}`}
											cacheKey={`${appId}:::${index + 1}`}
											variant="rounded"
											showErrorPlaceholder={false}
											maxRetries={3}
											style={{
												width: "100%",
												height: "100%",
												maxWidth: "100%",
												maxHeight: "100%",
												objectFit: "contain",
											}}
										/>
									</Box>
								);
							})}
						</Box>

						{/* Controles del carrusel */}
						{screenshots.length > 1 && (
							<>
								<IconButton
									aria-label={t("appDetails.prevScreenshot")}
									onClick={handlePrevImage}
									sx={{
										position: "absolute",
										left: 10,
										top: "50%",
										transform: "translateY(-50%)",
										bgcolor: "rgba(0, 0, 0, 0.5)",
										color: "white",
										"&:hover": {
											bgcolor: "rgba(0, 0, 0, 0.7)",
										},
									}}
								>
									<ChevronLeft />
								</IconButton>
								<IconButton
									aria-label={t("appDetails.nextScreenshot")}
									onClick={handleNextImage}
									sx={{
										position: "absolute",
										right: 10,
										top: "50%",
										transform: "translateY(-50%)",
										bgcolor: "rgba(0, 0, 0, 0.5)",
										color: "white",
										"&:hover": {
											bgcolor: "rgba(0, 0, 0, 0.7)",
										},
									}}
								>
									<ChevronRight />
								</IconButton>

								{/* Indicadores */}
								<Box
									sx={{
										display: "flex",
										justifyContent: "center",
										gap: 1,
										mt: 2,
									}}
								>
									{screenshots.map((_, index) => (
										<ButtonBase
											key={screenshotIds[index]}
											onClick={() => setCurrentImageIndex(index)}
											aria-label={t("appDetails.screenshotN", {
												number: index + 1,
											})}
											aria-pressed={index === currentImageIndex}
											sx={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												bgcolor:
													index === currentImageIndex
														? "primary.main"
														: "grey.600",
												transition: "all 0.3s",
												"&:hover": {
													bgcolor:
														index === currentImageIndex
															? "primary.main"
															: "grey.500",
												},
											}}
										/>
									))}
								</Box>
							</>
						)}
					</Box>
				) : (
					<Box
						sx={{
							textAlign: "center",
							py: 4,
							color: "text.secondary",
						}}
					>
						<Typography>{t("appDetails.noScreenshots")}</Typography>
					</Box>
				)}
			</>
		);
	},
);

ScreenshotCarousel.displayName = "ScreenshotCarousel";
