import { useMemo } from "react";
import { KLIA_APP_IDS, KLIA_DEVELOPER } from "../data/kliaApps";
import { OFF_FLATHUB_APPS } from "../data/offFlathubApps";
import type { CategoryApp } from "../types";
import { useDeveloperApps } from "./useDeveloperApps";

// Une las apps off-Flathub (datos locales) con las publicadas en Flathub.
// Las locales tienen prioridad, igual que en la pantalla de detalles.
export const useKliaApps = () => {
	const { data, isLoading, error } = useDeveloperApps(KLIA_DEVELOPER);

	const apps = useMemo(() => {
		const flathubById = new Map(
			(data?.hits ?? []).map((app) => [app.app_id, app]),
		);
		return KLIA_APP_IDS.map(
			(id) => OFF_FLATHUB_APPS[id] ?? flathubById.get(id),
		).filter((app): app is CategoryApp => app !== undefined);
	}, [data]);

	// Las apps locales ya se muestran aunque Flathub falle o esté cargando.
	return { apps, isLoading: isLoading && apps.length === 0, error };
};
