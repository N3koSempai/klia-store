import {
	Box,
	Button,
	Dialog,
	DialogContent,
	LinearProgress,
	Typography,
} from "@mui/material";
import type { TFunction } from "i18next";
import { memo } from "react";
import { brand, hues, lines, neutral, status } from "../../theme/tokens";
import type { AppToVerify } from "../UpdateAllModal";
import {
	AppVerificationRow,
	type AppVerificationState,
} from "./AppVerificationRow";

interface Stats {
	verified: number;
	warning: number;
	hashMismatch: number;
	pending: number;
	included: number;
}

interface VerifyingReviewPhaseDialogProps {
	open: boolean;
	onClose: () => void;
	t: TFunction;
	isVerifyingPhase: boolean;
	appsToVerify: AppToVerify[];
	appStates: Record<string, AppVerificationState>;
	stats: Stats;
	completedCount: number;
	progressPercent: number;
	systemUpdatesCount: number;
	onSetDecision: (appId: string, decision: "include" | "exclude") => void;
	onToggleDetails: (appId: string) => void;
	onCancelAll: () => void;
	onProceedFromReview: () => void;
}

export const VerifyingReviewPhaseDialog = memo(
	({
		open,
		onClose,
		t,
		isVerifyingPhase,
		appsToVerify,
		appStates,
		stats,
		completedCount,
		progressPercent,
		systemUpdatesCount,
		onSetDecision,
		onToggleDetails,
		onCancelAll,
		onProceedFromReview,
	}: VerifyingReviewPhaseDialogProps) => {
		const progressBarColor =
			stats.hashMismatch > 0
				? brand.danger
				: stats.warning > 0
					? brand.secondary
					: hues.green;

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
						sx={{ color: neutral[800], fontWeight: 600, mb: 2 }}
					>
						{isVerifyingPhase
							? t("appDetails.verifyingSecurity")
							: t("appDetails.securityVerificationDetails")}
					</Typography>

					{/* Progress bar */}
					<Box sx={{ mb: 2 }}>
						<Box
							sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}
						>
							<Typography variant="caption" sx={{ color: neutral[600] }}>
								{t("appDetails.securityVerificationSourcesChecked")}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: neutral[600], fontFamily: "monospace" }}
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
								bgcolor: lines.subtle,
								"& .MuiLinearProgress-bar": {
									bgcolor: isVerifyingPhase ? status.info : progressBarColor,
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
									<Typography sx={{ color: hues.green, fontSize: "0.85rem" }}>
										✓
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: hues.green, fontWeight: 600 }}
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
									<Typography
										sx={{ color: brand.secondary, fontSize: "0.85rem" }}
									>
										⚠
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: brand.secondary, fontWeight: 600 }}
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
									<Typography sx={{ color: brand.danger, fontSize: "0.85rem" }}>
										✗
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: brand.danger, fontWeight: 600 }}
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
										bgcolor: lines.subtle,
										border: `1px solid ${lines.default}`,
									}}
								>
									<Typography
										variant="caption"
										sx={{ color: neutral[600], fontWeight: 600 }}
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
							border: `1px solid ${lines.subtle}`,
							mb: 2,
						}}
					>
						{appsToVerify.map((app, i) => {
							const state = appStates[app.appId];
							if (!state) return null;

							return (
								<AppVerificationRow
									key={app.appId}
									app={app}
									state={state}
									isLast={i === appsToVerify.length - 1}
									isVerifyingPhase={isVerifyingPhase}
									t={t}
									onSetDecision={onSetDecision}
									onToggleDetails={onToggleDetails}
								/>
							);
						})}
					</Box>

					{/* System updates note */}
					{systemUpdatesCount > 0 && !isVerifyingPhase && (
						<Typography
							variant="caption"
							sx={{ color: neutral[500], display: "block", mb: 2 }}
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
							color="neutral"
							onClick={onCancelAll}
							disabled={isVerifyingPhase}
						>
							{t("myApps.verificationCancelAll")}
						</Button>

						{!isVerifyingPhase && stats.included > 0 && (
							<Button
								size="small"
								variant="contained"
								color="success"
								onClick={onProceedFromReview}
							>
								{stats.included === 1
									? t("myApps.updateAllCount", { count: stats.included })
									: t("myApps.updateAllCount_plural", {
											count: stats.included,
										})}
							</Button>
						)}
					</Box>
				</DialogContent>
			</Dialog>
		);
	},
);

VerifyingReviewPhaseDialog.displayName = "VerifyingReviewPhaseDialog";
