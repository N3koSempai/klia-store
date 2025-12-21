import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

interface InstallableExtensionRust {
  extension_id: string;
  name: string;
  version: string;
}

export interface AvailableExtension {
  extensionId: string;
  name: string;
  version: string;
  isInstalled: boolean;
}

interface UseAppExtensionsReturn {
  availableExtensions: AvailableExtension[];
  isLoading: boolean;
  error: string | null;
  fetchExtensions: (appId: string, forceRefresh?: boolean) => Promise<void>;
}

export function useAppExtensions(): UseAppExtensionsReturn {
  const [availableExtensions, setAvailableExtensions] = useState<
    AvailableExtension[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache to avoid refetching the same app's extensions
  const cacheRef = useRef<Map<string, AvailableExtension[]>>(new Map());

  const fetchExtensions = useCallback(
    async (appId: string, forceRefresh = false) => {
      // Check cache first
      if (!forceRefresh && cacheRef.current.has(appId)) {
        const cached = cacheRef.current.get(appId);
        if (cached) {
          setAvailableExtensions(cached);
          setError(null);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get installable extensions from backend
        // Note: Backend returns snake_case fields (extension_id, name, version)
        const extensions = await invoke<InstallableExtensionRust[]>(
          "get_installable_extensions",
          {
            appId,
          },
        );

        // Map snake_case to camelCase and mark as not installed by default
        const extensionsWithStatus: AvailableExtension[] = extensions.map(
          (ext) => ({
            extensionId: ext.extension_id,
            name: ext.name,
            version: ext.version,
            isInstalled: false,
          }),
        );

        // Store in cache
        cacheRef.current.set(appId, extensionsWithStatus);

        setAvailableExtensions(extensionsWithStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setAvailableExtensions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    availableExtensions,
    isLoading,
    error,
    fetchExtensions,
  };
}
