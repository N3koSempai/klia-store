// Apps del ecosistema Klia. Algunas viven en Flathub y otras solo en GitHub
// (estas últimas están definidas en OFF_FLATHUB_APPS).
export const KLIA_DEVELOPER = "N3koSempai";

export const KLIA_APP_IDS = [
	"io.github.N3kosempai.klia-store",
	"io.github.N3kosempai.klia-kompress",
	"io.github.N3kosempai.klia-transcribe",
	"io.github.N3kosempai.klia-scaler-player",
	"io.github.N3kosempai.hetairos-ai",
];

// El nombre de desarrollador llega tal cual lo reporta flatpak o Flathub,
// así que se compara sin distinguir mayúsculas.
export const isKliaDeveloper = (name: string | undefined): boolean =>
	name?.trim().toLowerCase() === KLIA_DEVELOPER.toLowerCase();
