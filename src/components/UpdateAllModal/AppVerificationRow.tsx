import {
	Box,
	Button,
	CircularProgress,
	Collapse,
	Typography,
} from "@mui/material";
import type { TFunction } from "i18next";
import { memo } from "react";
import type { AppToVerify } from "../UpdateAllModal";

export interface AppVerificationState {
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

interface AppVerificationRowProps {
	app: AppToVerify;
	state: AppVerificationState;
	isLast: boolean;
	isVerifyingPhase: boolean;
	t: TFunction;
	onSetDecision: (appId: string, decision: "include" | "exclude") => void;
	onToggleDetails: (appId: string) => void;
}

export const AppVerificationRow = memo(
	({
		app,
		state,
		isLast,
		isVerifyingPhase,
		t,
		onSetDecision,
		onToggleDetails,
	}: AppVerificationRowProps) => {
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
			<Box>
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
								sx={{ color: "#6E7681", fontSize: "0.6rem", letterSpacing: 1 }}
							>
								···
							</Typography>
						) : (
							<Typography sx={{ color: statusColor, fontSize: "0.85rem" }}>
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
										state.decision === "exclude" ? "contained" : "outlined"
									}
									onClick={() => onSetDecision(app.appId, "exclude")}
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
													border: "1px solid rgba(255,255,255,0.2)",
													"&:hover": {
														bgcolor: "rgba(255,255,255,0.14)",
													},
												}
											: {
													borderColor: "rgba(255, 255, 255, 0.15)",
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
										state.decision === "include" ? "contained" : "outlined"
									}
									onClick={() => onSetDecision(app.appId, "include")}
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
								onClick={() => onToggleDetails(app.appId)}
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
					{!isActionable && !isVerifyingPhase && state.phase === "verified" && (
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
									<div style={{ color: statusColor, marginBottom: 6 }}>
										{t("appDetails.securityVerificationOverallStatus")}:{" "}
										{state.phase === "hashMismatch"
											? `✗ ${t("appDetails.securityVerificationFailed")}`
											: `⚠ ${t("appDetails.securitySourceUnavailable")}`}
									</div>
									{state.fullResult.sources.map((s) => (
										<div
											key={s.url}
											style={{ marginBottom: 4, paddingLeft: 6 }}
										>
											[{s.verified ? "✓" : "✗"}] {s.url}
											<br />
											<span style={{ color: "#6E7681" }}>
												{t("appDetails.securityVerificationCommitInManifest")}:{" "}
												{s.commit || "N/A"}
											</span>
											{s.remote_commit && (
												<>
													<br />
													<span style={{ color: "#6E7681" }}>
														{t("appDetails.securityVerificationRemoteCommit")}:{" "}
														{s.remote_commit}
													</span>
												</>
											)}
											{s.error && (
												<>
													<br />
													<span style={{ color: "#FF6B6B" }}>
														{t("appDetails.securityVerificationError")}:{" "}
														{s.error}
													</span>
												</>
											)}
										</div>
									))}
									{state.fullResult.error && (
										<div style={{ marginTop: 6, color: "#FF6B6B" }}>
											{t("appDetails.securityVerificationError")}:{" "}
											{state.fullResult.error}
										</div>
									)}
								</>
							)}
						</Box>
					</Collapse>
				)}
			</Box>
		);
	},
);

AppVerificationRow.displayName = "AppVerificationRow";
