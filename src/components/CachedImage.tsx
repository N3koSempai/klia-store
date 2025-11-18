import { Box, Skeleton } from "@mui/material";
import { BrokenImage } from "@mui/icons-material";
import { useEffect, useState } from "react";
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

		const loadImage = async () => {
			try {
				setIsLoading(true);
				setImageLoaded(false);

				const cachedPath = await imageCacheManager.getOrCacheImage(
					keyToUse,
					imageUrl,
				);

				if (isMounted) {
					setImageSrc(cachedPath);
					loadedImagesCache.set(keyToUse, cachedPath);
					setIsLoading(false);
				}
			} catch (err) {
				console.error("Error loading cached image:", err);
				if (isMounted) {
					// If cache fails, try with original URL
					if (retryCount < maxRetries) {
						setImageSrc(imageUrl);
						setRetryCount(retryCount + 1);
					} else {
						// Max retries reached
						if (showErrorPlaceholder) {
							setHasError(true);
							failedImagesCache.add(keyToUse);
						}
					}
					setIsLoading(false);
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
	}, [appId, imageUrl, cacheKey, keyToUse, retryCount, maxRetries, showErrorPlaceholder]);

	// If there's a definitive error, show placeholder
	if (hasError) {
		return (
			<Box
				sx={{
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					bgcolor: "action.hover",
					borderRadius: variant === "rounded" ? 2 : variant === "circular" ? "50%" : 0,
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
			<>
				<Skeleton
					variant={variant}
					sx={{
						width: "100%",
						height: "100%",
						...style,
						display: imageLoaded ? "none" : "block",
					}}
					className={className}
					animation="wave"
				/>
				{imageSrc && (
					<img
						src={imageSrc}
						alt={alt}
						style={{
							...style,
							display: imageLoaded ? "block" : "none",
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
			</>
		);
	}

	return (
		<img
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
