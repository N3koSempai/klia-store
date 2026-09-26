import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { reportNetworkFailure, reportNetworkSuccess } from "./store/connectivityStore";
import { isNetworkError } from "./utils/networkError";

// Deriva el estado de conectividad global a partir de los resultados de las
// queries/mutations que la app ya dispara — sin hacer ninguna llamada extra.
// `dataUpdatedAt`/`errorUpdatedAt` de React Query marcan cuándo terminó (no
// empezó) cada intento; se usan como aproximación de "startedAt" para que un
// éxito resuelto antes del último fallo conocido no apague el indicador.
export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			if (isNetworkError(error)) reportNetworkFailure();
		},
		onSuccess: (_data, query) => {
			reportNetworkSuccess(query.state.dataUpdatedAt);
		},
	}),
	mutationCache: new MutationCache({
		onError: (error) => {
			if (isNetworkError(error)) reportNetworkFailure();
		},
		onSuccess: (_data, _vars, _ctx, mutation) => {
			reportNetworkSuccess(mutation.state.submittedAt);
		},
	}),
});

export const router = createRouter({
	routeTree,
	context: {
		queryClient,
	},
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
