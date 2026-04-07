import {
	Box,
	Button,
	CircularProgress,
	Collapse,
	Dialog,
	DialogContent,
	LinearProgress,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "./Terminal";

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

interface AppVerificationState {
	phase: "pending" | "verifying" | "verified" | "warning" | "hashMismatch";
	decision: "include" | "exclude";
	showDetails: boolean;
	fullResult: {
		sources: Array<{
			url: string;
			commit: string;
			verified: boolean;
			remote_commit?: string;
			error?: string;
			platform?: string;
		}>;
		error?: string;
	} | null;
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

	// ══════════════════════════════════════════════════════════════════════
	// UPDATE PHASE
	// ══════════════════════════════════════════════════════════════════════
	if (isUpdating || updateOutput.length > 0) {
		const totalItems = totalApps + (systemUpdatesCount > 0 ? 1 : 0);
		const overallProgress =
			totalItems > 0 ? (currentAppIndex / totalItems) * 100 : 0;
		const displayProgress = isUpdatingSystem
			? systemUpdateProgress
			: currentAppProgress;
		const displayName = isUpdatingSystem
			? t("myApps.systemAndRuntimeUpdates")
			: currentAppName || t("myApps.waiting");

		return (
			<Dialog
				open={open}
				onClose={!isUpdating ? onClose : undefined}
				maxWidth="md"
				fullWidth
			>
				<DialogContent>
					<Typography variant="h6" gutterBottom>
						{t("myApps.updatingAllApps")}
					</Typography>

					{/* Overall progress */}
					<Box sx={{ mb: 3 }}>
						<Box
							sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
						>
							<Typography variant="body2" color="text.secondary">
								{t("myApps.overallProgress")}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{currentAppIndex} / {totalItems}
							</Typography>
						</Box>
						<LinearProgress
							variant="determinate"
							value={overallProgress}
							sx={{ height: 8, borderRadius: 1 }}
						/>
					</Box>

					{/* Current app progress */}
					<Box sx={{ mb: 3 }}>
						<Box
							sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
						>
							<Typography variant="body2" color="text.secondary">
								{t("myApps.currentApp")}
							</Typography>
							<Typography
								variant="body2"
								color="primary"
								sx={{ fontWeight: "bold" }}
							>
								{displayName}
							</Typography>
						</Box>
						<LinearProgress
							variant={displayProgress >= 0 ? "determinate" : "indeterminate"}
							value={displayProgress}
							sx={{ height: 8, borderRadius: 1 }}
						/>
					</Box>

					{/* Terminal toggle + output */}
					<Box sx={{ mb: 2 }}>
						{onToggleTerminal && (
							<Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
								<Button
									variant="outlined"
									size="small"
									onClick={onToggleTerminal}
									sx={{ borderColor: "divider", color: "text.secondary" }}
								>
									{showTerminal
										? t("myApps.hideDetails")
										: t("myApps.showDetails")}
								</Button>
							</Box>
						)}
						{showTerminal && updateOutput.length > 0 && (
							<Box sx={{ maxHeight: 200, overflow: "auto" }}>
								<Terminal output={updateOutput} isRunning={isUpdating} />
							</Box>
						)}
						{!showTerminal && updateOutput.length > 0 && (
							<Box
								sx={{
									maxHeight: 100,
									overflow: "hidden",
									filter: "blur(2px)",
									opacity: 0.5,
									pointerEvents: "none",
								}}
							>
								<Terminal output={updateOutput} isRunning={isUpdating} />
							</Box>
						)}
					</Box>

					{/* Completion summary */}
					{!isUpdating && (
						<>
							<Box
								sx={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 1.5,
									p: 2.5,
									mb: 2,
									bgcolor:
										updateErrorCount > 0
											? "rgba(246, 211, 45, 0.05)"
											: "rgba(39, 201, 63, 0.05)",
									borderRadius: 2,
									border: `1px solid ${
										updateErrorCount > 0
											? "rgba(246, 211, 45, 0.3)"
											: "rgba(39, 201, 63, 0.3)"
									}`,
								}}
							>
								<Box
									sx={{
										width: 56,
										height: 56,
										borderRadius: "50%",
										bgcolor:
											updateErrorCount > 0
												? "rgba(246, 211, 45, 0.1)"
												: "rgba(39, 201, 63, 0.1)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										border: `2px solid ${updateErrorCount > 0 ? "#F6D32D" : "#27c93f"}`,
									}}
								>
									<Typography
										sx={{
											color: updateErrorCount > 0 ? "#F6D32D" : "#27c93f",
											fontSize: "1.6rem",
										}}
									>
										{updateErrorCount > 0 ? "⚠" : "✓"}
									</Typography>
								</Box>
								<Typography
									variant="body1"
									sx={{
										color: updateErrorCount > 0 ? "#F6D32D" : "#27c93f",
										fontWeight: 600,
										textAlign: "center",
									}}
								>
									{updateErrorCount > 0
										? t("myApps.updateSummaryWithErrors", {
												success: updateSuccessCount,
												errors: updateErrorCount,
											})
										: updateSuccessCount === 1
											? t("myApps.updateSummarySuccess", {
													count: updateSuccessCount,
												})
											: t("myApps.updateSummarySuccess_plural", {
													count: updateSuccessCount,
												})}
								</Typography>
							</Box>
							<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
								<Button variant="contained" onClick={onClose}>
									{t("myApps.closeButton")}
								</Button>
							</Box>
						</>
					)}
				</DialogContent>
			</Dialog>
		);
	}

	// ══════════════════════════════════════════════════════════════════════
	// COUNTDOWN PHASE — all apps verified, auto-proceeding
	// ══════════════════════════════════════════════════════════════════════
	if (modalPhase === "countdown") {
		return (
			<Dialog open={open} maxWidth="sm" fullWidth>
				<DialogContent sx={{ p: 3 }}>
					<Typography
						variant="subtitle1"
						sx={{ color: "#C9D1D9", fontWeight: 600, mb: 3 }}
					>
						{t("appDetails.verifyingSecurity")}
					</Typography>

					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 2.5,
							p: 4,
							bgcolor: "rgba(255, 255, 255, 0.02)",
							borderRadius: 2,
							border: "1px solid rgba(39, 201, 63, 0.35)",
							mb: 3,
						}}
					>
						<Box
							sx={{
								width: 72,
								height: 72,
								borderRadius: "50%",
								bgcolor: "rgba(39, 201, 63, 0.1)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								border: "2px solid #27c93f",
							}}
						>
							<Typography sx={{ color: "#27c93f", fontSize: "2.2rem" }}>
								✓
							</Typography>
						</Box>

						<Typography
							variant="h6"
							textAlign="center"
							sx={{ color: "#27c93f", fontWeight: 600 }}
						>
							{t("appDetails.securityVerificationSuccess")}
						</Typography>

						<Typography
							variant="body2"
							textAlign="center"
							sx={{ color: "#8B949E", maxWidth: 380 }}
						>
							{t("appDetails.securityHashVerifiedExplanation")}
						</Typography>

						<Typography
							variant="body2"
							sx={{ color: "#C9D1D9", fontFamily: "monospace" }}
						>
							{t("myApps.updateStartingInSeconds", { countdown })}
						</Typography>
					</Box>

					<Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
						<Button
							size="small"
							variant="outlined"
							onClick={handleReviewDetails}
							sx={{
								borderColor: "rgba(255, 255, 255, 0.2)",
								color: "#8B949E",
								fontSize: "0.75rem",
								py: 0.5,
								textTransform: "none",
							}}
						>
							{t("myApps.verificationReviewDetails")}
						</Button>
						<Button
							size="small"
							variant="outlined"
							onClick={handleCancelAll}
							sx={{
								borderColor: "rgba(255, 255, 255, 0.2)",
								color: "#8B949E",
								fontSize: "0.75rem",
								py: 0.5,
								textTransform: "none",
							}}
						>
							{t("myApps.verificationCancelAll")}
						</Button>
					</Box>
				</DialogContent>
			</Dialog>
		);
	}

	// ══════════════════════════════════════════════════════════════════════
	// VERIFYING + REVIEW PHASE
	// ══════════════════════════════════════════════════════════════════════
	const progressBarColor =
		stats.hashMismatch > 0
			? "#FF6B6B"
			: stats.warning > 0
				? "#F6D32D"
				: "#27c93f";

	return (
		<Dialog
			open={open}
			onClose={!isVerifyingPhase ? onClose : undefined}
			maxWidth="sm"
			fullWidth
		>
			<DialogContent sx={{ p: 3 }}>
				{/* Header */}
				<Typography
					variant="subtitle1"
					sx={{ color: "#C9D1D9", fontWeight: 600, mb: 2 }}
				>
					{isVerifyingPhase
						? t("appDetails.verifyingSecurity")
						: t("appDetails.securityVerificationDetails")}
				</Typography>

				{/* Progress bar */}
				<Box sx={{ mb: 2 }}>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							mb: 0.5,
						}}
					>
						<Typography variant="caption" sx={{ color: "#8B949E" }}>
							{t("appDetails.securityVerificationSourcesChecked")}
						</Typography>
						<Typography
							variant="caption"
							sx={{ color: "#8B949E", fontFamily: "monospace" }}
						>
							{completedCount} / {appsToVerify.length}
						</Typography>
					</Box>
					<LinearProgress
						variant="determinate"
						value={progressPercent}
						sx={{
							height: 4,
							borderRadius: 1,
							bgcolor: "rgba(255, 255, 255, 0.05)",
							"& .MuiLinearProgress-bar": {
								bgcolor: isVerifyingPhase ? "#58A6FF" : progressBarColor,
								transition: "background-color 0.4s ease",
							},
						}}
					/>
				</Box>

				{/* Summary chips */}
				{completedCount > 0 && (
					<Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
						{stats.verified > 0 && (
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 0.5,
									px: 1.5,
									py: 0.5,
									borderRadius: 1,
									bgcolor: "rgba(39, 201, 63, 0.1)",
									border: "1px solid rgba(39, 201, 63, 0.3)",
								}}
							>
								<Typography sx={{ color: "#27c93f", fontSize: "0.85rem" }}>
									✓
								</Typography>
								<Typography
									variant="caption"
									sx={{ color: "#27c93f", fontWeight: 600 }}
								>
									{stats.verified}
								</Typography>
							</Box>
						)}
						{stats.warning > 0 && (
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 0.5,
									px: 1.5,
									py: 0.5,
									borderRadius: 1,
									bgcolor: "rgba(246, 211, 45, 0.1)",
									border: "1px solid rgba(246, 211, 45, 0.3)",
								}}
							>
								<Typography sx={{ color: "#F6D32D", fontSize: "0.85rem" }}>
									⚠
								</Typography>
								<Typography
									variant="caption"
									sx={{ color: "#F6D32D", fontWeight: 600 }}
								>
									{stats.warning}
								</Typography>
							</Box>
						)}
						{stats.hashMismatch > 0 && (
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 0.5,
									px: 1.5,
									py: 0.5,
									borderRadius: 1,
									bgcolor: "rgba(255, 107, 107, 0.1)",
									border: "1px solid rgba(255, 107, 107, 0.3)",
								}}
							>
								<Typography sx={{ color: "#FF6B6B", fontSize: "0.85rem" }}>
									✗
								</Typography>
								<Typography
									variant="caption"
									sx={{ color: "#FF6B6B", fontWeight: 600 }}
								>
									{stats.hashMismatch}
								</Typography>
							</Box>
						)}
						{isVerifyingPhase && stats.pending > 0 && (
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 0.5,
									px: 1.5,
									py: 0.5,
									borderRadius: 1,
									bgcolor: "rgba(255, 255, 255, 0.05)",
									border: "1px solid rgba(255, 255, 255, 0.1)",
								}}
							>
								<Typography
									variant="caption"
									sx={{ color: "#8B949E", fontWeight: 600 }}
								>
									{stats.pending} {t("myApps.verificationPending")}
								</Typography>
							</Box>
						)}
					</Box>
				)}

				{/* App list */}
				<Box
					sx={{
						maxHeight: 320,
						overflow: "auto",
						bgcolor: "rgba(0, 0, 0, 0.2)",
						borderRadius: 2,
						border: "1px solid rgba(255, 255, 255, 0.06)",
						mb: 2,
					}}
				>
					{appsToVerify.map((app, i) => {
						const state = appStates[app.appId];
						if (!state) return null;

						const isLast = i === appsToVerify.length - 1;
						const isActionable =
							(state.phase === "warning" || state.phase === "hashMismatch") &&
							!isVerifyingPhase;

						const statusColor =
							state.phase === "verified"
								? "#27c93f"
								: state.phase === "warning"
									? "#F6D32D"
									: state.phase === "hashMismatch"
										? "#FF6B6B"
										: "#58A6FF";

						return (
							<Box key={app.appId}>
								<Box
									sx={{
										display: "flex",
										alignItems: "flex-start",
										gap: 1.5,
										p: 1.5,
										borderBottom: isLast
											? "none"
											: "1px solid rgba(255, 255, 255, 0.05)",
										opacity: state.decision === "exclude" ? 0.45 : 1,
										transition: "opacity 0.2s ease",
									}}
								>
									{/* Status icon */}
									<Box
										sx={{
											width: 28,
											height: 28,
											borderRadius: "50%",
											bgcolor: `${statusColor}18`,
											border: `1.5px solid ${statusColor}50`,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
											mt: 0.25,
										}}
									>
										{state.phase === "verifying" ? (
											<CircularProgress size={13} sx={{ color: "#58A6FF" }} />
										) : state.phase === "pending" ? (
											<Typography
												sx={{
													color: "#6E7681",
													fontSize: "0.6rem",
													letterSpacing: 1,
												}}
											>
												···
											</Typography>
										) : (
											<Typography
												sx={{ color: statusColor, fontSize: "0.85rem" }}
											>
												{state.phase === "verified"
													? "✓"
													: state.phase === "warning"
														? "⚠"
														: "✗"}
											</Typography>
										)}
									</Box>

									{/* App info */}
									<Box sx={{ flex: 1, minWidth: 0 }}>
										<Typography
											variant="caption"
											sx={{
												color: "#C9D1D9",
												fontWeight: 500,
												display: "block",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{app.appName}
										</Typography>
										<Typography
											variant="caption"
											sx={{
												color: "#6E7681",
												fontFamily: "monospace",
												fontSize: "0.65rem",
												display: "block",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{app.appId}
										</Typography>

										{/* Inline message for actionable apps */}
										{isActionable && (
											<Typography
												variant="caption"
												sx={{
													color: statusColor,
													display: "block",
													mt: 0.25,
													fontSize: "0.68rem",
												}}
											>
												{state.phase === "hashMismatch"
													? t("appDetails.securityHashMismatch")
													: t("myApps.verificationWarningMessage")}
											</Typography>
										)}
									</Box>

									{/* Action buttons (warning / hashMismatch in review mode) */}
									{isActionable && (
										<Box
											sx={{
												display: "flex",
												flexDirection: "column",
												gap: 0.5,
												flexShrink: 0,
											}}
										>
											<Box sx={{ display: "flex", gap: 0.5 }}>
												{/* Skip button */}
												<Button
													size="small"
													variant={
														state.decision === "exclude"
															? "contained"
															: "outlined"
													}
													onClick={() =>
														handleSetDecision(app.appId, "exclude")
													}
													sx={{
														minWidth: 50,
														fontSize: "0.65rem",
														py: 0.25,
														px: 0.75,
														textTransform: "none",
														...(state.decision === "exclude"
															? {
																	bgcolor: "rgba(255, 255, 255, 0.1)",
																	color: "#8B949E",
																	border:
																		"1px solid rgba(255,255,255,0.2)",
																	"&:hover": {
																		bgcolor:
																			"rgba(255,255,255,0.14)",
																	},
																}
															: {
																	borderColor:
																		"rgba(255, 255, 255, 0.15)",
																	color: "#6E7681",
																}),
													}}
												>
													{t("myApps.verificationSkipApp")}
												</Button>

												{/* Include / Force button */}
												<Button
													size="small"
													variant={
														state.decision === "include"
															? "contained"
															: "outlined"
													}
													onClick={() =>
														handleSetDecision(app.appId, "include")
													}
													sx={{
														minWidth: 50,
														fontSize: "0.65rem",
														py: 0.25,
														px: 0.75,
														textTransform: "none",
														...(state.decision === "include"
															? {
																	bgcolor:
																		state.phase === "hashMismatch"
																			? "rgba(255,107,107,0.22)"
																			: "rgba(246,211,45,0.18)",
																	color:
																		state.phase === "hashMismatch"
																			? "#FF6B6B"
																			: "#F6D32D",
																	border: `1px solid ${
																		state.phase === "hashMismatch"
																			? "rgba(255,107,107,0.45)"
																			: "rgba(246,211,45,0.45)"
																	}`,
																	"&:hover": {
																		bgcolor:
																			state.phase === "hashMismatch"
																				? "rgba(255,107,107,0.3)"
																				: "rgba(246,211,45,0.28)",
																	},
																}
															: {
																	borderColor:
																		state.phase === "hashMismatch"
																			? "rgba(255,107,107,0.3)"
																			: "rgba(246,211,45,0.3)",
																	color:
																		state.phase === "hashMismatch"
																			? "#FF6B6B80"
																			: "#F6D32D80",
																}),
													}}
												>
													{state.phase === "hashMismatch"
														? t("myApps.verificationForceApp")
														: t("myApps.verificationIncludeApp")}
												</Button>
											</Box>

											{/* Details toggle */}
											<Button
												size="small"
												variant="text"
												onClick={() => handleToggleDetails(app.appId)}
												sx={{
													fontSize: "0.6rem",
													py: 0,
													px: 0.5,
													textTransform: "none",
													color: "#6E7681",
													justifyContent: "flex-end",
													"&:hover": { color: "#8B949E" },
												}}
											>
												{state.showDetails ? "▲ " : "▼ "}
												{t("myApps.verificationMoreDetails")}
											</Button>
										</Box>
									)}

									{/* Verified badge in review mode */}
									{!isActionable &&
										!isVerifyingPhase &&
										state.phase === "verified" && (
											<Typography
												variant="caption"
												sx={{
													color: "#27c93f",
													fontSize: "0.7rem",
													flexShrink: 0,
													alignSelf: "center",
												}}
											>
												✓
											</Typography>
										)}
								</Box>

								{/* Expandable details */}
								{isActionable && (
									<Collapse in={state.showDetails}>
										<Box
											sx={{
												mx: 1.5,
												mb: 1.5,
												p: 1.5,
												bgcolor: "rgba(0, 0, 0, 0.35)",
												borderRadius: 1,
												border: `1px solid ${statusColor}28`,
												fontFamily: "'JetBrains Mono', monospace",
												fontSize: "0.7rem",
												color: "#8B949E",
												whiteSpace: "pre-wrap",
												wordBreak: "break-word",
												maxHeight: 160,
												overflow: "auto",
											}}
										>
											{state.fullResult && (
												<>
													<div
														style={{
															color: statusColor,
															marginBottom: 6,
														}}
													>
														{t(
															"appDetails.securityVerificationOverallStatus",
														)}
														:{" "}
														{state.phase === "hashMismatch"
															? `✗ ${t("appDetails.securityVerificationFailed")}`
															: `⚠ ${t("appDetails.securitySourceUnavailable")}`}
													</div>
													{state.fullResult.sources.map((s) => (
														<div
															key={s.url}
															style={{
																marginBottom: 4,
																paddingLeft: 6,
															}}
														>
															[{s.verified ? "✓" : "✗"}] {s.url}
															<br />
															<span style={{ color: "#6E7681" }}>
																{t(
																	"appDetails.securityVerificationCommitInManifest",
																)}
																: {s.commit || "N/A"}
															</span>
															{s.remote_commit && (
																<>
																	<br />
																	<span style={{ color: "#6E7681" }}>
																		{t(
																			"appDetails.securityVerificationRemoteCommit",
																		)}
																		: {s.remote_commit}
																	</span>
																</>
															)}
															{s.error && (
																<>
																	<br />
																	<span style={{ color: "#FF6B6B" }}>
																		{t(
																			"appDetails.securityVerificationError",
																		)}
																		: {s.error}
																	</span>
																</>
															)}
														</div>
													))}
													{state.fullResult.error && (
														<div
															style={{ marginTop: 6, color: "#FF6B6B" }}
														>
															{t(
																"appDetails.securityVerificationError",
															)}
															: {state.fullResult.error}
														</div>
													)}
												</>
											)}
										</Box>
									</Collapse>
								)}
							</Box>
						);
					})}
				</Box>

				{/* System updates note */}
				{systemUpdatesCount > 0 && !isVerifyingPhase && (
					<Typography
						variant="caption"
						sx={{ color: "#6E7681", display: "block", mb: 2 }}
					>
						{systemUpdatesCount === 1
							? t("myApps.systemPackageNote", { count: systemUpdatesCount })
							: t("myApps.systemPackageNote_plural", {
									count: systemUpdatesCount,
								})}
					</Typography>
				)}

				{/* Footer buttons */}
				<Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
					<Button
						size="small"
						variant="outlined"
						onClick={handleCancelAll}
						disabled={isVerifyingPhase}
						sx={{
							borderColor: "rgba(255, 255, 255, 0.2)",
							color: "#8B949E",
							fontSize: "0.75rem",
							py: 0.5,
							textTransform: "none",
							"&.Mui-disabled": {
								borderColor: "rgba(255, 255, 255, 0.1)",
								color: "rgba(255, 255, 255, 0.3)",
							},
						}}
					>
						{t("myApps.verificationCancelAll")}
					</Button>

					{!isVerifyingPhase && stats.included > 0 && (
						<Button
							size="small"
							variant="contained"
							onClick={handleProceedFromReview}
							sx={{
								bgcolor: "#27c93f",
								color: "#0D1117",
								fontWeight: 600,
								fontSize: "0.75rem",
								py: 0.5,
								textTransform: "none",
								"&:hover": { bgcolor: "#2ed547" },
							}}
						>
							{stats.included === 1
								? t("myApps.updateAllCount", { count: stats.included })
								: t("myApps.updateAllCount_plural", { count: stats.included })}
						</Button>
					)}
				</Box>
			</DialogContent>
		</Dialog>
	);
};
