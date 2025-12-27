import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

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
 * Uses get_install_dependencies command (no PTY process)
 * @param appId - The Flatpak application ID (e.g., "org.gnome.Builder")
 * @returns DependenciesCheckResult with list of dependencies, loading state, and error
 */
export function useRuntimeCheck(appId: string): DependenciesCheckResult {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDependencies = async () => {
      try {
        setLoading(true);
        setError(null);

        const deps = await invoke<Dependency[]>("get_install_dependencies", {
          appId,
        });

        console.log("[useRuntimeCheck] Dependencies fetched:", deps);
        setDependencies(deps);
      } catch (err) {
        console.error("[useRuntimeCheck] Error fetching dependencies:", err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchDependencies();
  }, [appId]);

  return {
    dependencies,
    loading,
    error,
  };
}
