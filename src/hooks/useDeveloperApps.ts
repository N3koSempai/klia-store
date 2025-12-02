import { useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api";

export const useDeveloperApps = (developerId: string) => {
	return useQuery({
		queryKey: ["developerApps", developerId],
		queryFn: () => apiService.getDeveloperApps(developerId),
		enabled: !!developerId,
	});
};
