import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { API_BASE_URL } from "../constants/api";

export class ApiError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		public url: string,
		message?: string,
	) {
		super(message || `HTTP ${status} ${statusText} for ${url}`);
		this.name = "ApiError";
	}
}

interface FetchOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}

interface PendingRequest {
	promise: Promise<unknown>;
	abort: () => void;
}

export class ApiClient {
	private baseUrl: string;
	private timeoutMs: number;
	private maxRetries: number;
	private pendingRequests = new Map<string, PendingRequest>();

	constructor(options?: {
		baseUrl?: string;
		timeoutMs?: number;
		maxRetries?: number;
	}) {
		this.baseUrl = options?.baseUrl ?? API_BASE_URL;
		this.timeoutMs = options?.timeoutMs ?? 10_000;
		this.maxRetries = options?.maxRetries ?? 2;
	}

	private getCacheKey(url: string, options?: FetchOptions): string {
		return `${options?.method ?? "GET"}:${url}:${options?.body ?? ""}`;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async request<T>(path: string, options?: FetchOptions): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const cacheKey = this.getCacheKey(url, options);

		// Deduplicate concurrent identical requests
		const existing = this.pendingRequests.get(cacheKey);
		if (existing) {
			return existing.promise as Promise<T>;
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		const promise = this.executeWithRetry<T>(url, {
			...options,
			signal: controller.signal,
		}).finally(() => {
			clearTimeout(timeoutId);
			this.pendingRequests.delete(cacheKey);
		});

		this.pendingRequests.set(cacheKey, {
			promise,
			abort: () => controller.abort(),
		});

		return promise;
	}

	private async executeWithRetry<T>(
		url: string,
		options: FetchOptions,
		attempt = 0,
	): Promise<T> {
		try {
			const response = await tauriFetch(url, options);

			if (!response.ok) {
				throw new ApiError(response.status, response.statusText, url);
			}

			return (await response.json()) as T;
		} catch (error) {
			// Don't retry on abort or client errors (4xx)
			if (error instanceof DOMException && error.name === "AbortError") {
				throw error;
			}
			if (
				error instanceof ApiError &&
				error.status >= 400 &&
				error.status < 500
			) {
				throw error;
			}

			if (attempt < this.maxRetries) {
				const delay = 500 * 2 ** attempt;
				await this.sleep(delay);
				return this.executeWithRetry<T>(url, options, attempt + 1);
			}

			throw error;
		}
	}

	get<T>(path: string, headers?: Record<string, string>): Promise<T> {
		return this.request<T>(path, { method: "GET", headers });
	}

	post<T>(
		path: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T> {
		return this.request<T>(path, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		});
	}

	abortPending(path: string, method = "GET"): void {
		const url = `${this.baseUrl}${path}`;
		const cacheKey = this.getCacheKey(url, { method });
		const pending = this.pendingRequests.get(cacheKey);
		pending?.abort();
	}
}

export const apiClient = new ApiClient();
