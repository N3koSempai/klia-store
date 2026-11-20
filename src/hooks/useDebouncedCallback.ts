import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of `callback`: calling it resets a timer, and the
 * callback only runs after `delay` ms of silence. The latest callback is always
 * invoked (kept in a ref) so callers can pass an inline closure without the
 * debounce firing a stale one. Replaces the `use-debounce` package.
 */
export function useDebouncedCallback<A extends unknown[]>(
	callback: (...args: A) => void,
	delay: number,
): (...args: A) => void {
	const callbackRef = useRef(callback);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	// Clear any pending timer when the component unmounts.
	useEffect(() => () => clearTimeout(timeoutRef.current), []);

	return useCallback(
		(...args: A) => {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				callbackRef.current(...args);
			}, delay);
		},
		[delay],
	);
}
