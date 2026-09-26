/** Detecta si un error viene de falta de red/conexión, a partir de errores
 * que ya producen las llamadas existentes (invoke de Tauri, fetch de React Query).
 * No dispara ninguna llamada adicional. */
export function isNetworkError(error: unknown): boolean {
	const errorMsg = String(error).toLowerCase();
	return (
		errorMsg.includes("timeout") ||
		errorMsg.includes("error sending request") ||
		errorMsg.includes("connection") ||
		errorMsg.includes("network") ||
		errorMsg.includes("failed to fetch") ||
		// Errores de resolución DNS: los produce tanto reqwest (backend Rust,
		// ej. verify_app_hash) como el propio flatpak al no poder resolver
		// el host de un remoto (ej. "Couldn't resolve host name").
		errorMsg.includes("dns") ||
		errorMsg.includes("resolve host") ||
		errorMsg.includes("failed to lookup address") ||
		errorMsg.includes("couldn't resolve host") ||
		errorMsg.includes("could not resolve host") ||
		errorMsg.includes("temporary failure in name resolution") ||
		errorMsg.includes("unable to load summary")
	);
}
