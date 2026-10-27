import { useEffect, useState } from "react";
import { useInstalledAppsStore } from "../store/installedAppsStore";

// Tiempo máximo (desde que arrancó la app) que se espera a que respondan las
// dos fuentes de updates. Pasado ese tiempo se muestra lo que haya, para que una
// fuente lenta o sin red no oculte las actualizaciones de la otra.
const SETTLE_TIMEOUT_MS = 6000;
const startedAt = Date.now();

const remainingMs = () =>
	Math.max(0, SETTLE_TIMEOUT_MS - (Date.now() - startedAt));

/**
 * Cantidad de actualizaciones para el indicador de "Mis Apps". Devuelve 0 hasta
 * que Flathub y GitHub hayan respondido (o se agote el tiempo de espera), así el
 * número aparece una sola vez en lugar de saltar al llegar cada fuente. Una vez
 * asentado vuelve a ser dinámico (p. ej. baja al actualizar una app).
 */
export const useUpdateBadgeCount = (): number => {
	const updateCount = useInstalledAppsStore((state) => state.updateCount);
	const settled = useInstalledAppsStore(
		(state) => !state.isLoadingUpdates && state.githubUpdatesSettled,
	);
	const [timedOut, setTimedOut] = useState(() => remainingMs() === 0);

	useEffect(() => {
		if (settled || timedOut) return;
		const id = setTimeout(() => setTimedOut(true), remainingMs());
		return () => clearTimeout(id);
	}, [settled, timedOut]);

	return settled || timedOut ? updateCount : 0;
};
