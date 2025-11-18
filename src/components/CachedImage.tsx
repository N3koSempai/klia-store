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
	cacheKey?: string; // Si se proporciona, se usa en lugar de appId para el caché
	variant?: "rectangular" | "circular" | "rounded";
}

export const CachedImage = ({
	appId,
	imageUrl,
	alt,
	style,
	className,
	cacheKey,
	variant = "rectangular",
}: CachedImageProps) => {
	const [imageSrc, setImageSrc] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);
	const [imageLoaded, setImageLoaded] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [retryCount, setRetryCount] = useState(0);

	useEffect(() => {
		let isMounted = true;

		const loadImage = async () => {
			try {
				setIsLoading(true);
				setImageLoaded(false);

				// Usar cacheKey si se proporciona, sino usar appId
				const keyToUse = cacheKey || appId;
				const cachedPath = await imageCacheManager.getOrCacheImage(
					keyToUse,
					imageUrl,
				);

				if (isMounted) {
					setImageSrc(cachedPath);
					setIsLoading(false);
				}
			} catch (err) {
				console.error("Error loading cached image:", err);
				if (isMounted) {
					// Si falla el caché, intentar con la URL original una vez
					if (retryCount === 0) {
						setImageSrc(imageUrl);
						setRetryCount(1);
					} else {
						// Ya intentamos con la URL original y falló, mostrar placeholder
						setHasError(true);
					}
					setIsLoading(false);
				}
			}
		};

		if (imageUrl) {
			loadImage();
		} else {
			// No hay URL, mostrar error directamente
			setHasError(true);
			setIsLoading(false);
		}

		return () => {
			isMounted = false;
		};
	}, [appId, imageUrl, cacheKey, retryCount]);

	// Si hay error definitivo, mostrar placeholder
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

	// Mostrar skeleton mientras se obtiene la ruta O mientras la imagen se carga en el navegador
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
						onLoad={() => setImageLoaded(true)}
						onError={() => {
							// Si falla cargar, incrementar retry para intentar con URL original
							if (retryCount === 0) {
								setRetryCount(1);
								setImageSrc(imageUrl);
							} else {
								// Ya intentamos todo, mostrar error
								setHasError(true);
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
				// Si falla cargar la imagen final, mostrar placeholder
				setHasError(true);
			}}
		/>
	);
};
