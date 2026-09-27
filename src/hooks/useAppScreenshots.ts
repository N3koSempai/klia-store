import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { reportNetworkFailure, reportNetworkSuccess } from "../store/connectivityStore";
import type { AppStream } from "../types";
import { imageCacheManager } from "../utils/imageCache";
import { isNetworkError } from "../utils/networkError";
import { hasAnyValidRepoUrl } from "../utils/repoValidation";

interface UseAppScreenshotsReturn {
	screenshots: AppStream["screenshots"];
	urls: AppStream["urls"];
	isLoading: boolean;
	error: Error | null;
}

export const useAppScreenshots = (app: AppStream): UseAppScreenshotsReturn => {
	const [screenshots, setScreenshots] = useState<AppStream["screenshots"]>(
		app.screenshots,
	);
	const [urls, setUrls] = useState<AppStream["urls"]>(app.urls);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let isMounted = true;

		const loadScreenshots = async () => {
			// Update URLs from app.urls if they exist
			if (app.urls && isMounted) {
				setUrls(app.urls);
			}

			// Check if we need to fetch data
			const hasScreenshots = app.screenshots && app.screenshots.length > 0;
			const hasValidUrls = hasAnyValidRepoUrl(app.urls);
			const hasAnyUrls =
				app.urls &&
				(app.urls.vcs_browser ||
					app.urls.bugtracker ||
					app.urls.contribute ||
					app.urls.help);

			// Determine if we need to fetch
			const needsScreenshots = !hasScreenshots;
			const needsUrls = !hasValidUrls && !hasAnyUrls; // Only if we don't have any URLs at all

			// If we don't need screenshots AND we don't need URLs, no need to fetch
			if (!needsScreenshots && !needsUrls) {
				return;
			}

			setIsLoading(true);
			setError(null);
			const startedAt = Date.now();

			// La red tiene prioridad (trae datos frescos). Si falla, caemos en
			// silencio a las screenshots que ya tengamos cacheadas en disco de
			// una visita anterior, sin mostrar error al usuario.
			try {
				const appStreamData = await apiService.getAppStream(app.id);
				reportNetworkSuccess(startedAt);

				if (isMounted) {
					setScreenshots(appStreamData.screenshots);
					setUrls(appStreamData.urls);
					setIsLoading(false);
				}
				return;
			} catch (err) {
				console.error("Error fetching screenshots, falling back to cache:", err);
				if (isNetworkError(err)) {
					reportNetworkFailure();
				} else {
					reportNetworkSuccess(startedAt);
				}
			}

			try {
				// Buscar screenshots ya cacheadas en disco de una visita anterior.
				// Generar hasta 10 keys y consultarlas en paralelo.
				const cacheKeys = Array.from(
					{ length: 10 },
					(_, i) => `${app.id}:::${i + 1}`,
				);

				const cachedPaths = await Promise.all(
					cacheKeys.map((key) => imageCacheManager.getCachedImagePath(key)),
				);

				// Construir screenshots solo con los resultados existentes (sin huecos)
				const cachedScreenshots: AppStream["screenshots"] = [];
				for (const cachedPath of cachedPaths) {
					if (cachedPath) {
						cachedScreenshots.push({
							sizes: [
								{
									width: "1920",
									height: "1080",
									scale: "1",
									src: cachedPath,
								},
							],
						});
					} else {
						// Si no encontramos uno, asumimos que no hay más
						break;
					}
				}

				if (isMounted) {
					setScreenshots(cachedScreenshots);
					setIsLoading(false);
				}
			} catch (err) {
				console.error("Error loading cached screenshots:", err);
				if (isMounted) {
					setIsLoading(false);
				}
			}
		};

		loadScreenshots();

		return () => {
			isMounted = false;
		};
	}, [app.id, app.screenshots, app.urls]);

	return { screenshots, urls, isLoading, error };
};
