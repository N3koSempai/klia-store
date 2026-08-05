import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { dbCacheManager } from "../utils/dbCache";

interface UseCachedSectionQueryOptions<T> {
	sectionName: string;
	queryKey: string;
	/** Days before the cache is considered stale. 0 = compare against today's date. */
	maxDaysOld?: number;
	getCached: () => Promise<T | null>;
	/** Whether a cached value counts as "empty" (forces a fetch even if present). */
	isEmpty: (data: T) => boolean;
	fetcher: () => Promise<T>;
	cacheResult: (data: T) => Promise<void>;
	retry?: number | false;
	/** Called when the fetch fails; return a fallback value (e.g. stale cache) or rethrow. */
	onFetchError?: (error: unknown, cachedData: T) => T;
}

export const useCachedSectionQuery = <T>({
	sectionName,
	queryKey,
	maxDaysOld = 0,
	getCached,
	isEmpty,
	fetcher,
	cacheResult,
	retry = 3,
	onFetchError,
}: UseCachedSectionQueryOptions<T>) => {
	const [cachedData, setCachedData] = useState<T | null>(null);
	const [shouldFetch, setShouldFetch] = useState(false);
	const [isChecking, setIsChecking] = useState(true);

	// getCached/isEmpty are defined inline by each caller (new identity every
	// render). Keep the latest versions in a ref so the mount effect below can
	// use them without re-running on every render.
	const getCachedRef = useRef(getCached);
	getCachedRef.current = getCached;
	const isEmptyRef = useRef(isEmpty);
	isEmptyRef.current = isEmpty;

	// Load cache immediately on mount
	useEffect(() => {
		let cancelled = false;

		const loadCache = async () => {
			try {
				const cached = await getCachedRef.current();
				const cachedIsEmpty = cached === null || isEmptyRef.current(cached);

				if (cancelled) return;

				if (!cachedIsEmpty && cached !== null) {
					setCachedData(cached);
				}

				const shouldUpdate = await dbCacheManager.shouldUpdateSection(
					sectionName,
					maxDaysOld,
				);

				if (cancelled) return;

				setShouldFetch(shouldUpdate || cachedIsEmpty);
			} catch (error) {
				console.error(`[${queryKey}] Error loading cache:`, error);
				if (!cancelled) setShouldFetch(true);
			} finally {
				if (!cancelled) setIsChecking(false);
			}
		};

		loadCache();

		return () => {
			cancelled = true;
		};
	}, [sectionName, queryKey, maxDaysOld]);

	const query = useQuery({
		queryKey: [queryKey],
		queryFn: async () => {
			try {
				const data = await fetcher();
				await cacheResult(data);
				setCachedData(data);
				return data;
			} catch (error) {
				if (onFetchError && cachedData !== null) {
					return onFetchError(error, cachedData);
				}
				throw error;
			}
		},
		enabled: shouldFetch,
		retry,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
	});

	const hasCachedData = cachedData !== null && !isEmpty(cachedData);

	return {
		data: hasCachedData ? cachedData : query.data,
		isLoading: isChecking || (query.isLoading && !hasCachedData),
		error: query.error,
	};
};
