import { useEffect } from "react";
import { checkGitHubUpdates } from "../utils/githubUpdateChecker";
import { useInstalledAppsStore } from "../store/installedAppsStore";

export const useGitHubUpdates = () => {
	const mergeAvailableUpdates = useInstalledAppsStore(
		(state) => state.mergeAvailableUpdates,
	);

	useEffect(() => {
		const load = async () => {
			const results = await checkGitHubUpdates();
			const withUpdate = results
				.filter((r) => r.hasUpdate)
				.map((r) => ({
					appId: r.appId,
					newVersion: r.latestVersion,
					branch: "stable",
				}));

			if (withUpdate.length > 0) {
				mergeAvailableUpdates(withUpdate);
			}
		};

		load();
	}, [mergeAvailableUpdates]);
};
