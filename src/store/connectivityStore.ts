import { create } from "zustand";

interface ConnectivityStore {
	isOffline: boolean;
	// Marca de tiempo del último fallo de red detectado. Sirve para que un
	// éxito "viejo" (de una llamada que ya estaba en vuelo antes del fallo)
	// no pueda apagar el indicador por una condición de carrera.
	lastFailureAt: number;
	setOffline: (value: boolean) => void;
}

// Estado derivado de los resultados de las llamadas de red que la app ya hace
// (React Query, invoke de Tauri) — no se realiza ninguna llamada adicional
// solo para comprobar conectividad.
//
// Regla: cualquier fallo de red prende el indicador de inmediato. Una vez
// prendido, solo se apaga cuando una llamada que EMPEZÓ después del último
// fallo conocido termina con éxito — nunca por el simple hecho de que otra
// llamada distinta haya tenido éxito en paralelo.
export const useConnectivityStore = create<ConnectivityStore>()((set) => ({
	isOffline: false,
	lastFailureAt: 0,
	setOffline: (value) => {
		if (value) {
			set({ isOffline: true, lastFailureAt: Date.now() });
		} else {
			set({ isOffline: false });
		}
	},
}));

// Para reportar un éxito, se debe indicar cuándo empezó la llamada
// (startedAt). Si empezó antes del último fallo conocido, no cuenta como
// confirmación de que la red volvió.
export const reportNetworkSuccess = (startedAt: number) => {
	const { lastFailureAt, setOffline } = useConnectivityStore.getState();
	if (startedAt >= lastFailureAt) {
		setOffline(false);
	}
};

export const reportNetworkFailure = () => {
	useConnectivityStore.getState().setOffline(true);
};
