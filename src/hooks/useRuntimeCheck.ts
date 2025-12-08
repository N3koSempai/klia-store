import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useInstalledAppsStore } from "../store/installedAppsStore";

export interface RuntimeCheckResult {
	runtimeRef: string | null;
	isInstalled: boolean;
	loading: boolean;
	error: string | null;
}

/**
 * Custom hook to check if an app's runtime dependency is already installed
 * @param appId - The Flatpak application ID (e.g., "org.gnome.Builder")
 * @returns RuntimeCheckResult with runtime ref, install status, and loading state
 */
export function useRuntimeCheck(appId: string): RuntimeCheckResult {
	const [runtimeRef, setRuntimeRef] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const isRuntimeInstalled = useInstalledAppsStore(
		(state) => state.isRuntimeInstalled,
	);

	useEffect(() => {
		let cancelled = false;

		const checkRuntime = async () => {
			setLoading(true);
			setError(null);

			try {
				// Use Tauri command to get runtime info (works both inside and outside flatpak)
				const extractedRuntime = await invoke<string>("get_app_runtime_info", {
					appId,
				});

				if (cancelled) return;

				console.log(
					`[useRuntimeCheck] Found runtime for ${appId}:`,
					extractedRuntime,
				);
				setRuntimeRef(extractedRuntime);
			} catch (err) {
				if (!cancelled) {
					console.error(
						`[useRuntimeCheck] Error checking runtime for ${appId}:`,
						err,
					);
					setError(
						err instanceof Error ? err.message : "Unknown error occurred",
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		checkRuntime();

		return () => {
			cancelled = true;
		};
	}, [appId]);

	const installed = runtimeRef ? isRuntimeInstalled(runtimeRef) : false;

	// Debug logging
	if (runtimeRef && !loading) {
		console.log(`[useRuntimeCheck] Runtime "${runtimeRef}" installed:`, installed);
	}

	return {
		runtimeRef,
		isInstalled: installed,
		loading,
		error,
	};
}
