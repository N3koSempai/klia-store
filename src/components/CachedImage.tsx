import { BrokenImage } from "@mui/icons-material";
import { Box, Skeleton } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { imageCacheManager } from "../utils/imageCache";

interface CachedImageProps {
	appId: string;
	imageUrl: string;
	alt: string;
	style?: React.CSSProperties;
	className?: string;
	cacheKey?: string; // If provided, used instead of appId for cache
	variant?: "rectangular" | "circular" | "rounded";
	showErrorPlaceholder?: boolean; // If false, keeps loading skeleton instead of showing error
	maxRetries?: number; // Maximum number of retries (default: 1)
	isScreenshot?: boolean; // If true, skips lazy loading and priority queue (for carousels)
}

// In-memory cache to remember failed images across component mounts/unmounts
const failedImagesCache = new Set<string>();
const loadedImagesCache = new Map<string, string>();

export const CachedImage = ({
	appId,
	imageUrl,
	alt,
	style,
	className,
	cacheKey,
	variant = "rectangular",
	showErrorPlaceholder = true,
	maxRetries = 1,
	isScreenshot = false,
}: CachedImageProps) => {
	const keyToUse = cacheKey || appId;

	// Check cache first before setting initial state
	const cachedSrc = loadedImagesCache.get(keyToUse);
	const cachedError = failedImagesCache.has(keyToUse);

	const [imageSrc, setImageSrc] = useState<string>(cachedSrc || "");
	const [isLoading, setIsLoading] = useState(!cachedSrc && !cachedError);
	const [imageLoaded, setImageLoaded] = useState(!!cachedSrc);
	const [hasError, setHasError] = useState(cachedError);
	const [retryCount, setRetryCount] = useState(0);
	const [isVisible, setIsVisible] = useState(isScreenshot); // Screenshots always visible
	const containerRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);

	// IntersectionObserver for lazy loading (only for non-screenshots)
	useEffect(() => {
		if (isScreenshot) return;

		const elementToObserve = containerRef.current || imageRef.current;
		if (!elementToObserve) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setIsVisible(true);
					}
				});
			},
			{
				rootMargin: "50px", // Start loading 50px before visible
			},
		);

		observer.observe(elementToObserve);

		return () => {
			observer.disconnect();
		};
	}, [isScreenshot]);

	useEffect(() => {
		let isMounted = true;

		// If already in cache, skip loading
		if (failedImagesCache.has(keyToUse)) {
			setHasError(true);
			setIsLoading(false);
			return;
		}

		if (loadedImagesCache.has(keyToUse)) {
			setImageSrc(loadedImagesCache.get(keyToUse)!);
			setImageLoaded(true);
			setIsLoading(false);
			return;
		}

		// Only load if visible (or is screenshot)
		if (!isVisible) {
			return;
		}

		const loadImage = async () => {
			try {
				setIsLoading(true);
				setImageLoaded(false);

				// Priority: 0 for visible (high), 1 for not visible yet (low)
				const priority = isVisible ? 0 : 1;

				const cachedPath = await imageCacheManager.getOrCacheImage(
					keyToUse,
					imageUrl,
					isScreenshot ? 0 : priority, // Screenshots always high priority
				);

				if (isMounted) {
					setImageSrc(cachedPath);
					loadedImagesCache.set(keyToUse, cachedPath);
					setIsLoading(false);
				}
			} catch (err) {
				console.error("Error loading cached image:", err);
				if (isMounted) {
					const errorMsg = String(err).toLowerCase();
					const isTemporaryError =
						errorMsg.includes("timeout") ||
						errorMsg.includes("error sending request") ||
						errorMsg.includes("connection") ||
						errorMsg.includes("network");

					// Solo marcar como error permanente si no es temporal
					// o si ya se agotaron los reintentos del imageCache (que tiene su propio retry)
					if (!isTemporaryError) {
						// Error permanente (404, etc)
						if (showErrorPlaceholder) {
							setHasError(true);
							failedImagesCache.add(keyToUse);
						}
						setIsLoading(false);
					} else {
						// Error temporal - intentar con URL original como fallback
						if (retryCount < maxRetries) {
							setImageSrc(imageUrl);
							setRetryCount(retryCount + 1);
							setIsLoading(false);
						} else {
							// Después de todos los reintentos, mantener skeleton
							// pero no marcar como error permanente (podría funcionar después)
							if (showErrorPlaceholder) {
								setHasError(true);
							}
							setIsLoading(false);
						}
					}
				}
			}
		};

		if (imageUrl) {
			loadImage();
		} else {
			// No URL provided, show error directly
			if (showErrorPlaceholder) {
				setHasError(true);
				failedImagesCache.add(keyToUse);
			}
			setIsLoading(false);
		}

		return () => {
			isMounted = false;
		};
	}, [
		appId,
		imageUrl,
		cacheKey,
		keyToUse,
		retryCount,
		maxRetries,
		showErrorPlaceholder,
		isVisible,
		isScreenshot,
	]);

	// If there's a definitive error, show placeholder
	if (hasError) {
		return (
			<Box
				ref={containerRef}
				sx={{
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					bgcolor: "action.hover",
					borderRadius:
						variant === "rounded" ? 2 : variant === "circular" ? "50%" : 0,
					...style,
				}}
				className={className}
			>
				<BrokenImage sx={{ color: "text.disabled", fontSize: 40 }} />
			</Box>
		);
	}

	// Show skeleton while fetching path OR while image is loading in browser
	if (isLoading || !imageLoaded) {
		return (
			<Box
				ref={containerRef}
				sx={{ position: "relative", width: "100%", height: "100%" }}
			>
				{!imageLoaded && (
					<Skeleton
						variant={variant}
						sx={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: "100%",
							...style,
						}}
						className={className}
						animation="wave"
					/>
				)}
				{imageSrc && (
					<img
						src={imageSrc}
						alt={alt}
						style={{
							...style,
							opacity: imageLoaded ? 1 : 0,
							transition: "opacity 0.2s ease-in-out",
						}}
						className={className}
						onLoad={() => {
							setImageLoaded(true);
							loadedImagesCache.set(keyToUse, imageSrc);
						}}
						onError={() => {
							// If loading fails, retry with original URL
							if (retryCount < maxRetries) {
								setRetryCount(retryCount + 1);
								setImageSrc(imageUrl);
							} else {
								// Max retries reached
								if (showErrorPlaceholder) {
									setHasError(true);
									failedImagesCache.add(keyToUse);
								}
								setIsLoading(false);
							}
						}}
					/>
				)}
			</Box>
		);
	}

	return (
		<img
			ref={imageRef}
			src={imageSrc}
			alt={alt}
			style={style}
			className={className}
			onError={() => {
				// If final image fails to load, show placeholder
				if (showErrorPlaceholder) {
					setHasError(true);
					failedImagesCache.add(keyToUse);
				}
			}}
		/>
	);
};
