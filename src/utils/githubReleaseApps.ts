// App IDs that are distributed as GitHub releases instead of via Flathub.
// Both installation and updates for these apps must resolve the latest
// .flatpak asset from GitHub and install it locally rather than going
// through `flatpak install`/`flatpak update` against a remote.
export const GITHUB_RELEASE_REPOS: Record<string, string> = {
	"io.github.N3kosempai.klia-kompress": "N3koSempai/klia-kompress",
};

export const getGitHubReleaseRepo = (appId: string): string | undefined =>
	GITHUB_RELEASE_REPOS[appId];

interface UpdateSourceInfo {
	source?: "flathub" | "github";
	githubRepo?: string;
}

// Decide desde dónde actualizar appId, en orden de confianza decreciente:
// 1. La fuente real de instalación (derivada del `origin` de flatpak, ver
//    getInstallSource en installedAppsStore.ts) — nunca forzamos la ruta
//    github si la app está realmente instalada desde flathub, aunque el
//    appId también figure en GITHUB_RELEASE_REPOS.
// 2. Si aún no conocemos la fuente instalada (p. ej. primera carga),
//    caemos a lo que reportó el checker que detectó el update pendiente.
// 3. Por último, la tabla estática.
// Usado por useUpdateApp.ts y useUpdateAll.ts para evitar duplicar esta
// cascada de decisión en cada hook.
export function resolveGithubRepoForUpdate(
	appId: string,
	installSource: "flathub" | "github" | undefined,
	updateInfo: UpdateSourceInfo | undefined,
): string | undefined {
	if (installSource === "flathub") return undefined;
	if (installSource === "github") {
		return updateInfo?.githubRepo ?? getGitHubReleaseRepo(appId);
	}
	if (updateInfo?.source === "flathub") return undefined;
	if (updateInfo?.source === "github") return updateInfo.githubRepo;
	return getGitHubReleaseRepo(appId);
}
