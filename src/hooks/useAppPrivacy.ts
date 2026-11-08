import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type AppPrivacyAssessment,
	assessAppPrivacy,
} from "../utils/appPrivacy";
import { appStreamQueryOptions } from "./appStreamQuery";
import { appSummaryQueryOptions } from "./appSummaryQuery";

/**
 * Resumen de privacidad de una app de Flathub a partir de sus permisos de
 * sandbox (/summary) y su clasificación de contenido (/appstream).
 * Si ambas peticiones fallan (app fuera de Flathub, sin red) no hay datos y la
 * UI oculta el badge; cada fuente degrada por separado a "desconocido".
 */
export const useAppPrivacy = (
	appId: string,
	hasDonation: boolean,
	version?: number,
): AppPrivacyAssessment | null => {
	const summary = useQuery(appSummaryQueryOptions(appId, version));
	const appStream = useQuery(appStreamQueryOptions(appId, version));

	return useMemo(() => {
		if (summary.isPending || appStream.isPending) return null;
		const assessment = assessAppPrivacy({
			permissions: summary.data?.metadata?.permissions,
			contentRating: appStream.data?.content_rating_details,
			hasDonation,
		});
		return assessment.hasData ? assessment : null;
	}, [
		summary.isPending,
		summary.data,
		appStream.isPending,
		appStream.data,
		hasDonation,
	]);
};
