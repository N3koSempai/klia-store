// App IDs that are distributed as GitHub releases instead of via Flathub.
// Both installation and updates for these apps must resolve the latest
// .flatpak asset from GitHub and install it locally rather than going
// through `flatpak install`/`flatpak update` against a remote.
export const GITHUB_RELEASE_REPOS: Record<string, string> = {
	"io.github.N3kosempai.klia-kompress": "N3koSempai/klia-kompress",
};

export const getGitHubReleaseRepo = (appId: string): string | undefined =>
	GITHUB_RELEASE_REPOS[appId];
