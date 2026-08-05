import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppVerificationState } from "./UpdateAllModal/AppVerificationRow";
import { CountdownPhaseDialog } from "./UpdateAllModal/CountdownPhaseDialog";
import { UpdatePhaseDialog } from "./UpdateAllModal/UpdatePhaseDialog";
import { VerifyingReviewPhaseDialog } from "./UpdateAllModal/VerifyingReviewPhaseDialog";

export interface AppToVerify {
	appId: string;
	appName: string;
}

// Kept for external compatibility
export interface VerificationDecision {
	appId: string;
	appName: string;
	status: "verified" | "warning" | "hashMismatch";
	decision: "include" | "exclude";
	error?: string;
}

type ModalPhase = "verifying" | "countdown" | "review";

interface UpdateAllModalProps {
	open: boolean;
	appsToVerify: AppToVerify[];
	onClose: () => void;
	onProceedWithUpdate: (appsToInclude: AppToVerify[]) => void;
	systemUpdatesCount: number;
	// Update phase props
	isUpdating?: boolean;
	updateOutput?: string[];
	showTerminal?: boolean;
	onToggleTerminal?: () => void;
	totalApps?: number;
	currentAppIndex?: number;
	currentAppName?: string;
	currentAppProgress?: number;
	isUpdatingSystem?: boolean;
	systemUpdateProgress?: number;
	updateSuccessCount?: number;
	updateErrorCount?: number;
}

export const UpdateAllModal = ({
	open,
	appsToVerify,
	onClose,
	onProceedWithUpdate,
	systemUpdatesCount,
	isUpdating = false,
	updateOutput = [],
	showTerminal = false,
	onToggleTerminal,
	totalApps = 0,
	currentAppIndex = 0,
	currentAppName = "",
	currentAppProgress = 0,
	isUpdatingSystem = false,
	systemUpdateProgress = 0,
	updateSuccessCount = 0,
	updateErrorCount = 0,
}: UpdateAllModalProps) => {
	const { t } = useTranslation();

	const [modalPhase, setModalPhase] = useState<ModalPhase>("verifying");
	const [appStates, setAppStates] = useState<Record<string, AppVerificationState>>({});
	const [countdown, setCountdown] = useState(3);

	const cancelledRef = useRef(false);
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Stable refs to avoid stale closures
	const appsToVerifyRef = useRef<AppToVerify[]>(appsToVerify);
	useEffect(() => {
		appsToVerifyRef.current = appsToVerify;
	}, [appsToVerify]);

	const onProceedRef = useRef(onProceedWithUpdate);
	useEffect(() => {
		onProceedRef.current = onProceedWithUpdate;
	}, [onProceedWithUpdate]);

	const appStatesRef = useRef(appStates);
	useEffect(() => {
		appStatesRef.current = appStates;
	}, [appStates]);

	const classifyResult = useCallback(
		(raw: {
			verified: boolean;
			sources: Array<{ error?: string; platform?: string }>;
			error?: string;
		}) => {
			const errorMsg = raw.sources[0]?.error || raw.error || "";
			const isHashMismatch =
				errorMsg.toLowerCase().includes("hash mismatch") ||
				errorMsg.toLowerCase().includes("mismatch");
			return { verified: raw.verified, isHashMismatch };
		},
		[],
	);

	// ── Parallel verification ──────────────────────────────────────────────
	useEffect(() => {
		if (!open) {
			cancelledRef.current = true;
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
			return;
		}

		const apps = appsToVerifyRef.current;

		// No user apps to verify → proceed directly (only system updates)
		if (apps.length === 0) {
			onProceedRef.current([]);
			return;
		}

		cancelledRef.current = false;
		if (countdownRef.current) {
			clearInterval(countdownRef.current);
			countdownRef.current = null;
		}

		// Initialize all apps as pending
		const initial: Record<string, AppVerificationState> = {};
		for (const app of apps) {
			initial[app.appId] = {
				phase: "pending",
				decision: "include",
				showDetails: false,
				fullResult: null,
			};
		}
		setAppStates(initial);
		setModalPhase("verifying");
		setCountdown(3);

		let completedCount = 0;
		const total = apps.length;

		for (const app of apps) {
			// Mark as verifying immediately
			setAppStates((prev) => ({
				...prev,
				[app.appId]: { ...prev[app.appId], phase: "verifying" },
			}));

			invoke<{
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
			}>("verify_app_hash", { appId: app.appId })
				.then((raw) => {
					if (cancelledRef.current) return;
					const { verified, isHashMismatch } = classifyResult(raw);
					const phase = verified
						? "verified"
						: isHashMismatch
							? "hashMismatch"
							: "warning";
					// Hash mismatch defaults to excluded; warnings default to included
					const decision: "include" | "exclude" = isHashMismatch ? "exclude" : "include";

					setAppStates((prev) => ({
						...prev,
						[app.appId]: {
							phase,
							decision,
							showDetails: false,
							fullResult: { sources: raw.sources, error: raw.error },
						},
					}));
				})
				.catch((err) => {
					if (cancelledRef.current) return;
					setAppStates((prev) => ({
						...prev,
						[app.appId]: {
							phase: "warning",
							decision: "include",
							showDetails: false,
							fullResult: { sources: [], error: String(err) },
						},
					}));
				})
				.finally(() => {
					if (cancelledRef.current) return;
					completedCount++;
					if (completedCount === total) {
						// Let last setState settle before evaluating
						setTimeout(() => {
							if (cancelledRef.current) return;
							setAppStates((current) => {
								const values = Object.values(current);
								const allVerified = values.every((r) => r.phase === "verified");
								setModalPhase(allVerified ? "countdown" : "review");
								return current;
							});
						}, 150);
					}
				});
		}

		return () => {
			cancelledRef.current = true;
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, classifyResult]); // only re-run when modal open state changes

	// ── Countdown ─────────────────────────────────────────────────────────
	useEffect(() => {
		if (modalPhase !== "countdown") return;

		setCountdown(3);
		countdownRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					if (countdownRef.current) clearInterval(countdownRef.current);
					countdownRef.current = null;
					if (!cancelledRef.current) {
						onProceedRef.current(appsToVerifyRef.current);
					}
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => {
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
		};
	}, [modalPhase]);

	useEffect(() => {
		return () => {
			if (countdownRef.current) clearInterval(countdownRef.current);
		};
	}, []);

	// ── Handlers ──────────────────────────────────────────────────────────
	const handleSetDecision = useCallback(
		(appId: string, decision: "include" | "exclude") => {
			setAppStates((prev) => ({
				...prev,
				[appId]: { ...prev[appId], decision },
			}));
		},
		[],
	);

	const handleToggleDetails = useCallback((appId: string) => {
		setAppStates((prev) => ({
			...prev,
			[appId]: { ...prev[appId], showDetails: !prev[appId].showDetails },
		}));
	}, []);

	const handleCancelAll = useCallback(() => {
		cancelledRef.current = true;
		if (countdownRef.current) clearInterval(countdownRef.current);
		onClose();
	}, [onClose]);

	const handleReviewDetails = useCallback(() => {
		if (countdownRef.current) {
			clearInterval(countdownRef.current);
			countdownRef.current = null;
		}
		setModalPhase("review");
	}, []);

	const handleProceedFromReview = useCallback(() => {
		const appsToInclude = appsToVerifyRef.current.filter(
			(app) => appStatesRef.current[app.appId]?.decision === "include",
		);
		if (appsToInclude.length > 0) {
			onProceedRef.current(appsToInclude);
		} else {
			onClose();
		}
	}, [onClose]);

	// ── Derived stats ──────────────────────────────────────────────────────
	const stats = useMemo(() => {
		const values = Object.values(appStates);
		return {
			verified: values.filter((r) => r.phase === "verified").length,
			warning: values.filter((r) => r.phase === "warning").length,
			hashMismatch: values.filter((r) => r.phase === "hashMismatch").length,
			pending: values.filter(
				(r) => r.phase === "pending" || r.phase === "verifying",
			).length,
			included: values.filter((r) => r.decision === "include").length,
		};
	}, [appStates]);

	const completedCount = appsToVerify.length - stats.pending;
	const progressPercent =
		appsToVerify.length > 0
			? (completedCount / appsToVerify.length) * 100
			: 0;
	const isVerifyingPhase = modalPhase === "verifying";

	if (!open) return null;

	if (isUpdating || updateOutput.length > 0) {
		return (
			<UpdatePhaseDialog
				open={open}
				onClose={onClose}
				t={t}
				isUpdating={isUpdating}
				updateOutput={updateOutput}
				showTerminal={showTerminal}
				onToggleTerminal={onToggleTerminal}
				totalApps={totalApps}
				currentAppIndex={currentAppIndex}
				currentAppName={currentAppName}
				currentAppProgress={currentAppProgress}
				isUpdatingSystem={isUpdatingSystem}
				systemUpdateProgress={systemUpdateProgress}
				systemUpdatesCount={systemUpdatesCount}
				updateSuccessCount={updateSuccessCount}
				updateErrorCount={updateErrorCount}
			/>
		);
	}

	if (modalPhase === "countdown") {
		return (
			<CountdownPhaseDialog
				open={open}
				t={t}
				countdown={countdown}
				onReviewDetails={handleReviewDetails}
				onCancelAll={handleCancelAll}
			/>
		);
	}

	return (
		<VerifyingReviewPhaseDialog
			open={open}
			onClose={onClose}
			t={t}
			isVerifyingPhase={isVerifyingPhase}
			appsToVerify={appsToVerify}
			appStates={appStates}
			stats={stats}
			completedCount={completedCount}
			progressPercent={progressPercent}
			systemUpdatesCount={systemUpdatesCount}
			onSetDecision={handleSetDecision}
			onToggleDetails={handleToggleDetails}
			onCancelAll={handleCancelAll}
			onProceedFromReview={handleProceedFromReview}
		/>
	);
};
