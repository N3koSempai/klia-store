import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import VolunteerActivism from "@mui/icons-material/VolunteerActivism";
import { Box, Button, Typography } from "@mui/material";
import type { TFunction } from "i18next";
import { memo } from "react";
import errorAnim from "../../../assets/animations/Error.lottie";
import successAnim from "../../../assets/animations/success.lottie";
import { Terminal } from "../../../components/Terminal";

export type InstallStatus =
	| "idle"
	| "verifying"
	| "verificationSuccess"
	| "verificationFailed"
	| "verificationUnsupported"
	| "verificationDetails"
	| "installing"
	| "success"
	| "error";

export interface VerificationResult {
	verified: boolean;
	sources: Array<{
		url: string;
		commit: string;
		verified: boolean;
		remote_commit?: string;
		error?: string;
		platform?: string;
	}>;
	error?: string;
	isHashMismatch: boolean;
	isUnsupportedPlatform: boolean;
}

interface InstallProgressPanelProps {
	installStatus: InstallStatus;
	countdown: number;
	verificationResult: VerificationResult | null;
	riskCountdown: number | null;
	installOutput: string[];
	isInstalling: boolean;
	t: TFunction;
	onShowVerificationDetails: () => void;
	onForceContinue: () => void;
	onCancelVerification: () => void;
	onBackFromDetails: () => void;
	onDownloadLog: () => void;
	onAccept: () => void;
	onWatchAd: () => void;
}

export const InstallProgressPanel = memo(
	({
		installStatus,
		countdown,
		verificationResult,
		riskCountdown,
		installOutput,
		isInstalling,
		t,
		onShowVerificationDetails,
		onForceContinue,
		onCancelVerification,
		onBackFromDetails,
		onDownloadLog,
		onAccept,
		onWatchAd,
	}: InstallProgressPanelProps) => {
		if (installStatus === "verifying") {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 3,
						p: 4,
						minHeight: 500,
						bgcolor: "#161B22",
						borderRadius: 2,
						border: "1px solid rgba(255, 255, 255, 0.1)",
					}}
				>
					<Typography
						variant="h5"
						textAlign="center"
						sx={{
							color: "#C9D1D9",
							fontWeight: 500,
						}}
					>
						{t("appDetails.securityVerifyingSignatures")}
					</Typography>

					{/* Spinner */}
					<Box
						sx={{
							width: 60,
							height: 60,
							border: "3px solid rgba(74, 134, 207, 0.3)",
							borderTop: "3px solid #4A86CF",
							borderRadius: "50%",
							animation: "spin 1s linear infinite",
							"@keyframes spin": {
								"0%": { transform: "rotate(0deg)" },
								"100%": { transform: "rotate(360deg)" },
							},
						}}
					/>

					<Typography
						variant="body2"
						sx={{
							color: "#8B949E",
							fontFamily: "'Fira Code', 'Courier New', monospace",
						}}
					>
						{t("appDetails.securityCheckingSignatures")}
					</Typography>
				</Box>
			);
		}

		if (installStatus === "verificationSuccess") {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 3,
						p: 4,
						minHeight: 500,
						bgcolor: "#161B22",
						borderRadius: 2,
						border: "1px solid rgba(39, 201, 63, 0.3)",
					}}
				>
					{/* Success Icon */}
					<Box
						sx={{
							width: 80,
							height: 80,
							borderRadius: "50%",
							bgcolor: "rgba(39, 201, 63, 0.1)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							border: "2px solid #27c93f",
						}}
					>
						<Typography sx={{ color: "#27c93f", fontSize: "2rem" }}>
							✓
						</Typography>
					</Box>

					<Typography
						variant="h5"
						textAlign="center"
						sx={{
							color: "#27c93f",
							fontWeight: 500,
						}}
					>
						{t("appDetails.securityVerificationSuccess")}
					</Typography>

					<Typography
						variant="body2"
						textAlign="center"
						sx={{
							color: "#8B949E",
							maxWidth: 500,
							px: 2,
						}}
					>
						{t("appDetails.securityHashVerifiedExplanation")}
					</Typography>

					<Typography
						variant="body1"
						textAlign="center"
						sx={{
							color: "#C9D1D9",
						}}
					>
						{t("appDetails.securityStartingInSeconds", { countdown })}
					</Typography>
				</Box>
			);
		}

		if (
			installStatus === "verificationFailed" ||
			installStatus === "verificationUnsupported"
		) {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 3,
						p: 4,
						minHeight: 500,
						bgcolor: "#161B22",
						borderRadius: 2,
						border: `1px solid ${
							verificationResult?.isUnsupportedPlatform
								? "rgba(246, 211, 45, 0.5)"
								: verificationResult?.isHashMismatch
									? "rgba(255, 107, 107, 0.5)"
									: "rgba(246, 211, 45, 0.5)"
						}`,
					}}
				>
					{/* Warning/Error Icon */}
					<Box
						sx={{
							width: 80,
							height: 80,
							borderRadius: "50%",
							bgcolor: verificationResult?.isUnsupportedPlatform
								? "rgba(246, 211, 45, 0.1)"
								: verificationResult?.isHashMismatch
									? "rgba(255, 107, 107, 0.1)"
									: "rgba(246, 211, 45, 0.1)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							border: `2px solid ${
								verificationResult?.isUnsupportedPlatform
									? "#F6D32D"
									: verificationResult?.isHashMismatch
										? "#FF6B6B"
										: "#F6D32D"
							}`,
						}}
					>
						<Typography
							sx={{
								color: verificationResult?.isUnsupportedPlatform
									? "#F6D32D"
									: verificationResult?.isHashMismatch
										? "#FF6B6B"
										: "#F6D32D",
								fontSize: "2rem",
							}}
						>
							⚠
						</Typography>
					</Box>

					<Typography
						variant="h5"
						textAlign="center"
						sx={{
							color: verificationResult?.isUnsupportedPlatform
								? "#F6D32D"
								: verificationResult?.isHashMismatch
									? "#FF6B6B"
									: "#F6D32D",
							fontWeight: 500,
						}}
					>
						{verificationResult?.isUnsupportedPlatform
							? t("appDetails.securityUnsupportedPlatform")
							: t("appDetails.securityVerificationFailed")}
					</Typography>

					<Typography
						variant="body2"
						textAlign="center"
						sx={{
							color: "#8B949E",
							maxWidth: 500,
							px: 2,
							mb: 2,
						}}
					>
						{t("appDetails.securityHashVerificationExplanation")}
					</Typography>

					<Typography
						variant="body1"
						textAlign="center"
						sx={{
							color: "#C9D1D9",
							maxWidth: 600,
						}}
					>
						{verificationResult?.isUnsupportedPlatform
							? t("appDetails.securityUnsupportedPlatformMessage")
							: verificationResult?.isHashMismatch
								? t("appDetails.securityHashMismatch")
								: t("appDetails.securitySourceUnavailable")}
					</Typography>

					{/* Action Buttons */}
					<Box sx={{ display: "flex", gap: 2, mt: 2 }}>
						<Button
							variant="outlined"
							onClick={onShowVerificationDetails}
							sx={{
								px: 3,
								borderColor: "rgba(255, 255, 255, 0.3)",
								color: "#C9D1D9",
								"&:hover": {
									borderColor: "rgba(255, 255, 255, 0.5)",
									bgcolor: "rgba(255, 255, 255, 0.05)",
								},
							}}
						>
							{t("appDetails.securityMoreDetails")}
						</Button>
						<Button
							variant="contained"
							onClick={onForceContinue}
							disabled={
								verificationResult?.isHashMismatch && riskCountdown !== null
							}
							sx={{
								px: 3,
								bgcolor: verificationResult?.isUnsupportedPlatform
									? "#F6D32D"
									: verificationResult?.isHashMismatch
										? "#FF6B6B"
										: "#F6D32D",
								color: "#0D1117",
								fontWeight: 600,
								"&:hover": {
									bgcolor: verificationResult?.isUnsupportedPlatform
										? "#f8db4e"
										: verificationResult?.isHashMismatch
											? "#ff8585"
											: "#f8db4e",
								},
								"&.Mui-disabled": {
									bgcolor: verificationResult?.isHashMismatch
										? "rgba(255, 107, 107, 0.5)"
										: "rgba(246, 211, 45, 0.5)",
									color: "#0D1117",
								},
							}}
						>
							{verificationResult?.isHashMismatch
								? riskCountdown !== null
									? `${t("appDetails.securityContinueAnywayRisk")} (${riskCountdown})`
									: t("appDetails.securityContinueAnywayRisk")
								: t("appDetails.securityContinueAnyway")}
						</Button>
					</Box>

					<Button
						onClick={onCancelVerification}
						sx={{
							color: "#8B949E",
							"&:hover": {
								color: "#C9D1D9",
							},
						}}
					>
						{t("appDetails.securityCancelInstallation")}
					</Button>
				</Box>
			);
		}

		if (installStatus === "verificationDetails") {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 3,
						p: 4,
						minHeight: 500,
						bgcolor: "#161B22",
						borderRadius: 2,
						border: `1px solid ${
							verificationResult?.isUnsupportedPlatform
								? "rgba(246, 211, 45, 0.5)"
								: verificationResult?.isHashMismatch
									? "rgba(255, 107, 107, 0.5)"
									: "rgba(246, 211, 45, 0.5)"
						}`,
					}}
				>
					<Typography
						variant="h5"
						textAlign="center"
						sx={{
							color: "#C9D1D9",
							fontWeight: 500,
						}}
					>
						{t("appDetails.securityVerificationDetails") ||
							"Verification Details"}
					</Typography>

					<Box
						sx={{
							width: "100%",
							maxWidth: 600,
							maxHeight: 300,
							overflow: "auto",
							bgcolor: "rgba(0,0,0,0.3)",
							borderRadius: 1,
							p: 2,
							fontFamily: "'Fira Code', 'Courier New', monospace",
							fontSize: "0.85rem",
							color: "#8B949E",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
						}}
					>
						{installOutput.map((line, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only log lines, index is stable
							<div key={index} style={{ marginBottom: 4 }}>
								{line}
							</div>
						))}
					</Box>

					<Box sx={{ display: "flex", gap: 2 }}>
						<Button
							variant="outlined"
							onClick={onDownloadLog}
							sx={{
								px: 3,
								borderColor: "rgba(255, 255, 255, 0.3)",
								color: "#C9D1D9",
								"&:hover": {
									borderColor: "rgba(255, 255, 255, 0.5)",
									bgcolor: "rgba(255, 255, 255, 0.05)",
								},
							}}
						>
							{t("appDetails.saveLog") || "Save Log"}
						</Button>
						<Button
							variant="contained"
							onClick={onBackFromDetails}
							sx={{
								px: 3,
								bgcolor: "rgba(255, 255, 255, 0.1)",
								color: "#C9D1D9",
								borderColor: "rgba(255, 255, 255, 0.3)",
								border: "1px solid",
								"&:hover": {
									bgcolor: "rgba(255, 255, 255, 0.2)",
								},
							}}
						>
							{t("appDetails.back") || "Back"}
						</Button>
					</Box>
				</Box>
			);
		}

		if (installStatus === "installing") {
			return (
				<>
					<Typography variant="h6" gutterBottom textAlign="center">
						{t("appDetails.installationInProgress")}
					</Typography>
					<Terminal output={installOutput} isRunning={isInstalling} />
				</>
			);
		}

		if (installStatus === "success" || installStatus === "error") {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 3,
						p: 4,
						minHeight: 500,
					}}
				>
					{/* Animación */}
					<Box sx={{ width: 300, height: 300 }}>
						<DotLottieReact
							key={installStatus}
							src={installStatus === "success" ? successAnim : errorAnim}
							loop={false}
							autoplay={true}
						/>
					</Box>

					{/* Mensaje */}
					<Typography variant="h5" textAlign="center">
						{installStatus === "success"
							? t("appDetails.installationCompleted")
							: t("appDetails.installationError")}
					</Typography>

					{/* Botones */}
					<Box sx={{ display: "flex", gap: 2 }}>
						<Button variant="outlined" onClick={onDownloadLog} sx={{ px: 3 }}>
							{t("appDetails.getLog")}
						</Button>
						<Button variant="contained" onClick={onAccept} sx={{ px: 3 }}>
							{t("appDetails.accept")}
						</Button>
					</Box>

					{/* Apoyo a Klia Store viendo un anuncio */}
					{installStatus === "success" && (
						<Box
							sx={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 1,
								mt: 2,
								pt: 3,
								borderTop: "1px solid",
								borderColor: "divider",
								width: "100%",
								maxWidth: 400,
							}}
						>
							<Typography
								variant="body2"
								color="text.secondary"
								textAlign="center"
							>
								{t("appDetails.supportKliaStoreDescription")}
							</Typography>
							<Button
								variant="text"
								startIcon={<VolunteerActivism />}
								onClick={onWatchAd}
								sx={{ px: 3 }}
							>
								{t("appDetails.watchAd")}
							</Button>
						</Box>
					)}
				</Box>
			);
		}

		return null;
	},
);

InstallProgressPanel.displayName = "InstallProgressPanel";
