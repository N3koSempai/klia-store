import { useEffect, useState } from "react";
import { hasValidRepoUrl } from "../utils/repoValidation";

interface RepoStatsData {
	stars: number | null;
	repoUrl: string | null;
}

type RepoSource = "github" | "gitlab" | "gitlab-gnome" | "unknown";

interface RepoInfo {
	source: RepoSource;
	owner: string;
	repo: string;
	baseUrl: string;
}

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour in milliseconds

export const useRepoStats = (
	appId: string,
	urls?: {
		bugtracker?: string;
		vcs_browser?: string;
	},
): RepoStatsData => {
	const [stars, setStars] = useState<number | null>(null);
	const [repoUrl, setRepoUrl] = useState<string | null>(null);

	useEffect(() => {
		const cleanRepoUrl = (url: string): string => {
			// Remove common trailing paths that are not part of the repo identifier
			const pathsToRemove = [
				"/issues",
				"/pulls",
				"/pull",
				"/issues/new",
				"/blob",
				"/tree",
				"/wiki",
				"/releases",
				"/commits",
				"/tags",
				"/branches",
				"/actions",
				"/projects",
				"/security",
				"/pulse",
				"/graphs",
				"/settings",
				"/discussions",
				"/-/issues",
				"/-/merge_requests",
				"/-/wikis",
				"/-/tree",
				"/-/blob",
			];

			let cleanedUrl = url;
			for (const path of pathsToRemove) {
				if (cleanedUrl.includes(path)) {
					cleanedUrl = cleanedUrl.split(path)[0];
				}
			}

			return cleanedUrl;
		};

		const detectRepoSource = (url: string): RepoInfo | null => {
			const cleanedUrl = cleanRepoUrl(url);

			// GitHub detection
			const githubMatch = cleanedUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/);
			if (githubMatch) {
				return {
					source: "github",
					owner: githubMatch[1],
					repo: githubMatch[2],
					baseUrl: "https://github.com",
				};
			}

			// GitLab GNOME detection
			const gitlabGnomeMatch = cleanedUrl.match(
				/gitlab\.gnome\.org\/([^/]+)\/([^/?#]+)/,
			);
			if (gitlabGnomeMatch) {
				return {
					source: "gitlab-gnome",
					owner: gitlabGnomeMatch[1],
					repo: gitlabGnomeMatch[2],
					baseUrl: "https://gitlab.gnome.org",
				};
			}

			// GitLab.com detection
			const gitlabMatch = cleanedUrl.match(/gitlab\.com\/([^/]+)\/([^/?#]+)/);
			if (gitlabMatch) {
				return {
					source: "gitlab",
					owner: gitlabMatch[1],
					repo: gitlabMatch[2],
					baseUrl: "https://gitlab.com",
				};
			}

			return null;
		};

		const fetchGitHubStars = async (
			repoInfo: RepoInfo,
		): Promise<number | null> => {
			try {
				const response = await fetch(
					`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`,
				);

				if (response.ok) {
					const data = await response.json();
					return data.stargazers_count || 0;
				}
			} catch (error) {
				console.error("Error fetching GitHub stars:", error);
			}
			return null;
		};

		const fetchGitLabStars = async (
			repoInfo: RepoInfo,
		): Promise<number | null> => {
			try {
				// URL-encode the project path (owner/repo)
				const projectPath = encodeURIComponent(
					`${repoInfo.owner}/${repoInfo.repo}`,
				);

				// Determine the API base URL based on the source
				const apiBaseUrl =
					repoInfo.source === "gitlab-gnome"
						? "https://gitlab.gnome.org/api/v4"
						: "https://gitlab.com/api/v4";

				const response = await fetch(`${apiBaseUrl}/projects/${projectPath}`);

				if (response.ok) {
					const data = await response.json();
					return data.star_count || 0;
				}
			} catch (error) {
				console.error("Error fetching GitLab stars:", error);
			}
			return null;
		};

		const fetchRepoStats = async () => {
			if (!urls) return;

			// Try multiple URLs in order of priority
			// Prioritize vcs_browser as it's usually the main repo
			// Then try bugtracker, contribute, and help
			const urlCandidates = [
				urls.vcs_browser,
				urls.bugtracker,
				urls.contribute,
				urls.help,
			];

			// Try each URL until we find a valid repo source
			let repoInfo: RepoInfo | null = null;
			for (const candidate of urlCandidates) {
				// Skip if not a valid repo URL (also filters out Flathub repos)
				if (!hasValidRepoUrl(candidate)) continue;

				const detectedInfo = detectRepoSource(candidate as string);

				if (detectedInfo) {
					repoInfo = detectedInfo;
					break;
				}
			}

			if (!repoInfo) return;

			// Set the full repository URL
			const fullRepoUrl = `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repo}`;
			setRepoUrl(fullRepoUrl);

			// Check sessionStorage cache
			const cacheKey = `repo_stats_${appId}`;
			const cached = sessionStorage.getItem(cacheKey);
			if (cached) {
				try {
					const { stars: cachedStars, timestamp } = JSON.parse(cached);
					if (Date.now() - timestamp < CACHE_DURATION) {
						setStars(cachedStars);
						return;
					}
				} catch (error) {
					console.error("Error parsing cached repo stats:", error);
				}
			}

			// Fetch stars based on source
			let starCount: number | null = null;

			if (repoInfo.source === "github") {
				starCount = await fetchGitHubStars(repoInfo);
			} else if (
				repoInfo.source === "gitlab" ||
				repoInfo.source === "gitlab-gnome"
			) {
				starCount = await fetchGitLabStars(repoInfo);
			}

			// Normalize the data - set to 0 if null to avoid breaking UI
			const normalizedCount = starCount ?? 0;
			setStars(normalizedCount);

			// Cache the result
			if (starCount !== null) {
				sessionStorage.setItem(
					cacheKey,
					JSON.stringify({
						stars: normalizedCount,
						timestamp: Date.now(),
					}),
				);
			}
		};

		fetchRepoStats();
	}, [appId, urls]);

	return { stars, repoUrl };
};
