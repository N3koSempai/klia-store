import { queryOptions } from "@tanstack/react-query";
import { apiService } from "../services/api";
import { dbCacheManager } from "../utils/dbCache";

/**
 * /appstream de una app. Con `version` (el updated_at de Flathub que trae la
 * tarjeta) se consulta antes la caché de SQLite: si hay un dato guardado para
 * esa versión no se llama a la red; si no, se pide y se guarda.
 */
export const appStreamQueryOptions = (appId: string, version?: number) =>
	queryOptions({
		queryKey: ["appStream", appId],
		queryFn: async () => {
			const key = version && version > 0 ? String(version) : null;
			if (key) {
				const cached = await dbCacheManager.getAppData<
					Awaited<ReturnType<typeof apiService.getAppStream>>
				>(appId, "appstream", key);
				if (cached) return cached;
			}
			const data = await apiService.getAppStream(appId);
			if (key) void dbCacheManager.setAppData(appId, "appstream", key, data);
			return data;
		},
		staleTime: 60 * 60 * 1000,
		retry: false,
	});
