import { convertFileSrc, invoke } from "@tauri-apps/api/core";

interface QueueItem {
	appId: string;
	imageUrl: string;
	priority: number; // 0 = high (visible), 1 = low (hidden)
	resolve: (value: string) => void;
	reject: (reason?: any) => void;
	retryCount?: number;
}

export class ImageCacheManager {
	private static instance: ImageCacheManager;
	private cacheDir: string | null = null;
	private initPromise: Promise<void> | null = null;
	private queue: QueueItem[] = [];
	private activeDownloads = 0;
	private readonly MAX_CONCURRENT_DOWNLOADS = 6;
	private readonly MAX_RETRIES = 2;
	private readonly DELAY_BETWEEN_DOWNLOADS = 150; // ms

	private constructor() {}

	static getInstance(): ImageCacheManager {
		if (!ImageCacheManager.instance) {
			ImageCacheManager.instance = new ImageCacheManager();
		}
		return ImageCacheManager.instance;
	}

	async initialize(): Promise<void> {
		// Si ya hay una inicialización en curso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Si ya está inicializado, retornar inmediatamente
		if (this.cacheDir) {
			return;
		}

		// Crear la promesa de inicialización
		this.initPromise = (async () => {
			try {
				// Limpiar cache antiguo si existe (basado en index.json)
				await invoke("clear_old_cache");

				// Obtener la ruta de la carpeta cacheImage
				this.cacheDir = await invoke<string>("get_cache_image_dir");

				console.log(`[ImageCache] Initializing cache at: ${this.cacheDir}`);
				console.log("[ImageCache] Initialization complete");
			} catch (error) {
				console.error("[ImageCache] Error initializing image cache:", error);
				this.initPromise = null; // Resetear para permitir reintento
				throw error;
			}
		})();

		return this.initPromise;
	}

	private async hashUrl(url: string): Promise<string> {
		const msgUint8 = new TextEncoder().encode(url);
		const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		return hashHex;
	}

	async getCachedImagePath(imageUrl: string): Promise<string | null> {
		await this.initialize();

		try {
			const hash = await this.hashUrl(imageUrl);
			// Probamos con las extensiones comunes ya que el sistema de archivos
			// ahora usa el hash como nombre base.
			const extensions = ["png", "jpg", "svg", "webp"];

			for (const ext of extensions) {
				const filename = `${hash}.${ext}`;
				const fullPath = await invoke<string>("get_cached_image_path", {
					filename,
				});

				const exists = await invoke<boolean>("check_file_exists", {
					path: fullPath,
				});

				if (exists) {
					let convertedPath = convertFileSrc(fullPath);

					// Si detectamos doble encoding (%2F), decodificar una vez
					if (convertedPath.includes("%2F")) {
						const url = new URL(convertedPath);
						const decodedPathname = decodeURIComponent(url.pathname);
						convertedPath = `${url.protocol}//${url.host}${decodedPathname}`;
					}

					return convertedPath;
				}
			}

			return null;
		} catch (error) {
			console.error("[ImageCache] Error getting cached image:", error);
			return null;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private isTemporaryError(error: any): boolean {
		const errorMsg = String(error).toLowerCase();
		// Errores temporales: timeout, network, connection
		return (
			errorMsg.includes("timeout") ||
			errorMsg.includes("error sending request") ||
			errorMsg.includes("connection") ||
			errorMsg.includes("network")
		);
	}

	private async downloadImage(
		appId: string,
		imageUrl: string,
		retryCount = 0,
	): Promise<string> {
		console.log(
			`[ImageCache] Downloading and caching image for ${appId}: ${imageUrl}${retryCount > 0 ? ` (retry ${retryCount})` : ""}`,
		);

		try {
			// Descargar y guardar la imagen (el backend generará el hash)
			const filename = await invoke<string>("download_and_cache_image", {
				appId,
				imageUrl,
			});

			const fullPath = await invoke<string>("get_cached_image_path", {
				filename,
			});
			let convertedPath = convertFileSrc(fullPath);

			// Si detectamos doble encoding, decodificar una vez
			if (convertedPath.includes("%2F")) {
				const url = new URL(convertedPath);
				const decodedPathname = decodeURIComponent(url.pathname);
				convertedPath = `${url.protocol}//${url.host}${decodedPathname}`;
			}

			return convertedPath;
		} catch (error) {
			console.error(`[ImageCache] Error caching image for ${appId}:`, error);

			// Si es un error temporal y aún quedan reintentos
			if (this.isTemporaryError(error) && retryCount < this.MAX_RETRIES) {
				// Exponential backoff: 500ms, 1000ms, 2000ms...
				const backoffDelay = 500 * 2 ** retryCount;
				console.log(`[ImageCache] Retrying in ${backoffDelay}ms...`);
				await this.sleep(backoffDelay);
				return this.downloadImage(appId, imageUrl, retryCount + 1);
			}

			throw error;
		}
	}

	private async processQueue(): Promise<void> {
		if (
			this.activeDownloads >= this.MAX_CONCURRENT_DOWNLOADS ||
			this.queue.length === 0
		) {
			return;
		}

		// Ordenar por prioridad (0 primero = visibles primero)
		this.queue.sort((a, b) => a.priority - b.priority);

		const item = this.queue.shift();
		if (!item) return;

		this.activeDownloads++;

		// Delay antes de iniciar descarga para espaciar las requests
		if (this.activeDownloads > 1) {
			await this.sleep(this.DELAY_BETWEEN_DOWNLOADS);
		}

		try {
			const result = await this.downloadImage(
				item.appId,
				item.imageUrl,
				item.retryCount || 0,
			);
			item.resolve(result);
		} catch (error) {
			item.reject(error);
		} finally {
			this.activeDownloads--;
			this.processQueue(); // Procesar siguiente en cola
		}
	}

	async cacheImage(
		appId: string,
		imageUrl: string,
		priority: number = 1,
	): Promise<string> {
		await this.initialize();

		return new Promise((resolve, reject) => {
			this.queue.push({ appId, imageUrl, priority, resolve, reject });
			this.processQueue();
		});
	}

	async getOrCacheImage(
		appId: string,
		imageUrl: string,
		priority: number = 1,
	): Promise<string> {
		// Primero intentar obtener de caché usando la URL
		const cachedPath = await this.getCachedImagePath(imageUrl);

		if (cachedPath) {
			return cachedPath;
		}

		// Si no está en caché, descargar y cachear con prioridad
		return await this.cacheImage(appId, imageUrl, priority);
	}
}

export const imageCacheManager = ImageCacheManager.getInstance();
