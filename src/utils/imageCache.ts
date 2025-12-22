import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export class ImageCacheManager {
  private static instance: ImageCacheManager;
  private cacheDir: string | null = null;
  private initPromise: Promise<void> | null = null;

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

  async cacheImage(appId: string, imageUrl: string): Promise<string> {
    await this.initialize();

    console.log(
      `[ImageCache] Downloading and caching image for ${appId}: ${imageUrl}`,
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
      throw error;
    }
  }

  async getOrCacheImage(appId: string, imageUrl: string): Promise<string> {
    // Primero intentar obtener de caché usando la URL
    const cachedPath = await this.getCachedImagePath(imageUrl);

    if (cachedPath) {
      return cachedPath;
    }

    // Si no está en caché, descargar y cachear
    return await this.cacheImage(appId, imageUrl);
  }
}

export const imageCacheManager = ImageCacheManager.getInstance();
