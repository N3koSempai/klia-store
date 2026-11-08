import { queryOptions } from "@tanstack/react-query";
import { apiService } from "../services/api";
import { dbCacheManager } from "../utils/dbCache";

/** /summary de una app, con la misma caché por versión que `appStreamQueryOptions`. */
export const appSummaryQueryOptions = (appId: string, version?: number) =>
	queryOptions({
		queryKey: ["appSummary", appId],
		queryFn: async () => {
			const key = version && version > 0 ? String(version) : null;
			if (key) {
				const cached = await dbCacheManager.getAppData<
					Awaited<ReturnType<typeof apiService.getAppSummary>>
				>(appId, "summary", key);
				if (cached) return cached;
			}
			const data = await apiService.getAppSummary(appId);
			if (key) void dbCacheManager.setAppData(appId, "summary", key, data);
			return data;
		},
		staleTime: 60 * 60 * 1000,
		retry: false,
	});
