import { Box, Button, Dialog, DialogContent, Typography } from "@mui/material";
import type { TFunction } from "i18next";
import { memo } from "react";

interface CountdownPhaseDialogProps {
	open: boolean;
	t: TFunction;
	countdown: number;
	onReviewDetails: () => void;
	onCancelAll: () => void;
}

export const CountdownPhaseDialog = memo(
	({
		open,
		t,
		countdown,
		onReviewDetails,
		onCancelAll,
	}: CountdownPhaseDialogProps) => {
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
							onClick={onReviewDetails}
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
							onClick={onCancelAll}
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
	},
);

CountdownPhaseDialog.displayName = "CountdownPhaseDialog";
