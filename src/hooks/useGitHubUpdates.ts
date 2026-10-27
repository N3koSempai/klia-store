import { useEffect } from "react";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import { checkGitHubUpdates } from "../utils/githubUpdateChecker";

export const useGitHubUpdates = () => {
	const mergeAvailableUpdates = useInstalledAppsStore(
		(state) => state.mergeAvailableUpdates,
	);
	const markGithubUpdatesSettled = useInstalledAppsStore(
		(state) => state.markGithubUpdatesSettled,
	);

	useEffect(() => {
		const load = async () => {
			try {
				const results = await checkGitHubUpdates();
				const withUpdate = results
					.filter((r) => r.hasUpdate)
					.map((r) => ({
						appId: r.appId,
						newVersion: r.latestVersion,
						branch: "stable",
						source: "github" as const,
						githubRepo: r.githubRepo,
					}));

				if (withUpdate.length > 0) {
					mergeAvailableUpdates(withUpdate);
				}
			} finally {
				// Con resultados, sin ellos o con error: la fuente ya respondió.
				markGithubUpdatesSettled();
			}
		};

		load();
	}, [mergeAvailableUpdates, markGithubUpdatesSettled]);
};
