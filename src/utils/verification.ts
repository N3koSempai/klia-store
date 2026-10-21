// Raw payload returned by the `verify_app_hash` command.
export interface RawVerificationResult {
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
}

export interface VerificationFlags {
	isHashMismatch: boolean;
	isUnsupportedPlatform: boolean;
	isSourceUnavailable: boolean;
}

// Derives the UI flags from the backend's message. A hash mismatch always
// wins over "source unavailable": a mismatch is a security signal and must
// never be downgraded to a mere connectivity problem.
export const classifyVerification = (
	raw: Pick<RawVerificationResult, "sources" | "error">,
): VerificationFlags => {
	const errorMsg = (raw.sources[0]?.error || raw.error || "").toLowerCase();
	const platform = raw.sources[0]?.platform || "unknown";

	const isHashMismatch = errorMsg.includes("mismatch");
	const isSourceUnavailable =
		!isHashMismatch &&
		(errorMsg.includes("tag") ||
			errorMsg.includes("could not verify") ||
			errorMsg.includes("not found") ||
			errorMsg.includes("failed to fetch"));

	return {
		isHashMismatch,
		isUnsupportedPlatform: platform === "unsupported",
		isSourceUnavailable,
	};
};
