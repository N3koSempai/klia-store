import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export type VerificationState =
	| "idle"
	| "verifying"
	| "success"
	| "failed"
	| "unsupported";

export interface SourceVerification {
	url: string;
	commit: string;
	verified: boolean;
	remote_commit?: string;
	error?: string;
	platform?: string;
}

export interface VerificationResult {
	verified: boolean;
	appId: string;
	sources: SourceVerification[];
	error?: string;
	isHashMismatch: boolean;
	isUnsupportedPlatform: boolean;
	isSourceUnavailable: boolean;
}

interface UseAppVerificationReturn {
	state: VerificationState;
	result: VerificationResult | null;
	verify: (appId: string) => Promise<void>;
	forceContinue: () => void;
	cancel: () => void;
	reset: () => void;
}

export function useAppVerification(): UseAppVerificationReturn {
	const [state, setState] = useState<VerificationState>("idle");
	const [result, setResult] = useState<VerificationResult | null>(null);

	const verify = useCallback(async (appId: string) => {
		setState("verifying");
		setResult(null);

		try {
			const raw = await invoke<{
				verified: boolean;
				app_id: string;
				sources: Array<{
					url: string;
					commit: string;
					verified: boolean;
					remote_commit?: string;
					error?: string;
					platform?: string;
				}>;
				error?: string;
			}>("verify_app_hash", { appId });

			const errorMsg = raw.sources[0]?.error || raw.error || "";
			const platform = raw.sources[0]?.platform || "unknown";

			const isUnsupportedPlatform = platform === "unsupported";
			const isHashMismatch =
				errorMsg.toLowerCase().includes("hash mismatch") ||
				errorMsg.toLowerCase().includes("mismatch");
			const isSourceUnavailable =
				!isHashMismatch &&
				(errorMsg.toLowerCase().includes("tag") ||
					errorMsg.toLowerCase().includes("could not verify") ||
					errorMsg.toLowerCase().includes("not found") ||
					errorMsg.toLowerCase().includes("failed to fetch"));

			const verificationResult: VerificationResult = {
				verified: raw.verified,
				appId: raw.app_id,
				sources: raw.sources,
				error: raw.error,
				isHashMismatch,
				isUnsupportedPlatform,
				isSourceUnavailable,
			};

			setResult(verificationResult);

			if (!raw.verified) {
				if (isUnsupportedPlatform) {
					setState("unsupported");
				} else {
					setState("failed");
				}
			} else {
				setState("success");
			}
		} catch (error) {
			const errorResult: VerificationResult = {
				verified: false,
				appId,
				sources: [],
				error: String(error),
				isHashMismatch: false,
				isUnsupportedPlatform: false,
				isSourceUnavailable: false,
			};
			setResult(errorResult);
			setState("failed");
		}
	}, []);

	const forceContinue = useCallback(() => {
		// No-op in hook; consumer handles the action
	}, []);

	const cancel = useCallback(() => {
		setState("idle");
		setResult(null);
	}, []);

	const reset = useCallback(() => {
		setState("idle");
		setResult(null);
	}, []);

	return {
		state,
		result,
		verify,
		forceContinue,
		cancel,
		reset,
	};
}
