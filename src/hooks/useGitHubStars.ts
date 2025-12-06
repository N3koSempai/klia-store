import { useEffect, useState } from "react";

interface GitHubRepoData {
	stars: number | null;
	repoUrl: string | null;
}

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour in milliseconds

export const useGitHubStars = (
	appId: string,
	urls?: {
		bugtracker?: string;
		vcs_browser?: string;
	},
): GitHubRepoData => {
	const [stars, setStars] = useState<number | null>(null);
	const [repoUrl, setRepoUrl] = useState<string | null>(null);

	useEffect(() => {
		const extractGitHubRepo = (
			url: string,
		): { owner: string; repo: string } | null => {
			const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
			if (match) {
				return { owner: match[1], repo: match[2] };
			}
			return null;
		};

		const fetchStars = async () => {
			if (!urls) return;

			const githubUrl = urls.vcs_browser || urls.bugtracker;
			if (!githubUrl || !githubUrl.includes("github.com")) return;

			const repoInfo = extractGitHubRepo(githubUrl);
			if (!repoInfo) return;

			const fullRepoUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}`;
			setRepoUrl(fullRepoUrl);

			// Check sessionStorage cache
			const cacheKey = `github_stars_${appId}`;
			const cached = sessionStorage.getItem(cacheKey);
			if (cached) {
				try {
					const { stars: cachedStars, timestamp } = JSON.parse(cached);
					if (Date.now() - timestamp < CACHE_DURATION) {
						setStars(cachedStars);
						return;
					}
				} catch (error) {
					console.error("Error parsing cached GitHub stars:", error);
				}
			}

			// Fetch from GitHub API
			try {
				const response = await fetch(
					`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`,
				);

				if (response.ok) {
					const data = await response.json();
					const starCount = data.stargazers_count;
					setStars(starCount);

					// Cache the result
					sessionStorage.setItem(
						cacheKey,
						JSON.stringify({
							stars: starCount,
							timestamp: Date.now(),
						}),
					);
				}
			} catch (error) {
				console.error("Error fetching GitHub stars:", error);
			}
		};

		fetchStars();
	}, [appId, urls]);

	return { stars, repoUrl };
};
