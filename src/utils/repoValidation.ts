/**
 * Check if a URL contains a valid repository source (GitHub or GitLab)
 * and is not a Flathub packaging repository
 */
export const hasValidRepoUrl = (url: string | undefined | null): boolean => {
	if (!url) return false;

	const validDomains = ["github.com", "gitlab.com", "gitlab.gnome.org"];
	// Check if it contains a valid domain
	const hasValidDomain = validDomains.some((domain) => url.includes(domain));
	if (!hasValidDomain) return false;

	// Check if it's not a Flathub packaging repo
	const isFlathubRepo = url.toLowerCase().includes("/flathub/");

	return !isFlathubRepo;
};

/**
 * Check if any of the provided URLs contains a valid repository source
 */
export const hasAnyValidRepoUrl = (
	urls:
		| {
				bugtracker?: string;
				vcs_browser?: string;
				contribute?: string;
				help?: string;
		  }
		| undefined
		| null,
): boolean => {
	if (!urls) return false;

	const urlCandidates = [
		urls.vcs_browser,
		urls.bugtracker,
		urls.contribute,
		urls.help,
	];

	return urlCandidates.some(hasValidRepoUrl);
};
