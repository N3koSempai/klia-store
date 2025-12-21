import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface Dependency {
  name: string;
  download_size: string;
  installed_size: string;
}

export interface DependenciesCheckResult {
  dependencies: Dependency[];
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook to check what dependencies will be installed for an app
 * Uses TanStack Query for caching to avoid redundant flatpak install calls
 * @param appId - The Flatpak application ID (e.g., "org.gnome.Builder")
 * @returns DependenciesCheckResult with list of dependencies, loading state, and error
 */
export function useRuntimeCheck(appId: string): DependenciesCheckResult {
  const query = useQuery({
    queryKey: ["app-dependencies", appId],
    queryFn: async () => {
      const deps = await invoke<Dependency[]>("get_install_dependencies", {
        appId,
      });
      return deps;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes - dependencies don't change frequently
    gcTime: 1000 * 60 * 60, // 1 hour - keep in cache
    retry: 1, // Only retry once on failure
    refetchOnWindowFocus: false, // Don't refetch when switching windows
    refetchOnMount: false, // Don't refetch on remount if cache exists
  });

  return {
    dependencies: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? String(query.error) : null,
  };
}
