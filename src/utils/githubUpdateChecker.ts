import { invoke } from "@tauri-apps/api/core";
import { OFF_FLATHUB_APPS } from "../data/offFlathubApps";

interface GitHubUpdateInfoRust {
	app_id: string;
	latest_version: string;
	installed_version: string;
	has_update: boolean;
	github_repo: string;
}

export interface GitHubUpdateInfo {
	appId: string;
	latestVersion: string;
	installedVersion: string;
	hasUpdate: boolean;
	githubRepo: string;
}

function buildAppsToCheck(): [string, string][] {
	return Object.values(OFF_FLATHUB_APPS)
		.filter((app) => app.urls?.vcs_browser?.includes("github.com"))
		.map((app) => {
			const match = app.urls!.vcs_browser!.match(
				/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
			);
			return match ? ([app.app_id, match[1]] as [string, string]) : null;
		})
		.filter((entry): entry is [string, string] => entry !== null);
}

export const checkGitHubUpdates = async (): Promise<GitHubUpdateInfo[]> => {
	const apps = buildAppsToCheck();
	if (apps.length === 0) return [];

	try {
		const results = await invoke<GitHubUpdateInfoRust[]>("check_github_updates", { apps });
		return results.map((r) => ({
			appId: r.app_id,
			latestVersion: r.latest_version,
			installedVersion: r.installed_version,
			hasUpdate: r.has_update,
			githubRepo: r.github_repo,
		}));
	} catch (error) {
		console.error("[githubUpdateChecker] Failed to check GitHub updates:", error);
		return [];
	}
};
