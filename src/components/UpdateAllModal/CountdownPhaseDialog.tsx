import { Box, Button, Dialog, DialogContent, Typography } from "@mui/material";
import type { TFunction } from "i18next";
import { memo } from "react";
import { hues, lines, neutral } from "../../theme/tokens";

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
						sx={{ color: neutral[800], fontWeight: 600, mb: 3 }}
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
							bgcolor: lines.subtle,
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
								border: `2px solid ${hues.green}`,
							}}
						>
							<Typography sx={{ color: hues.green, fontSize: "2.2rem" }}>
								✓
							</Typography>
						</Box>

						<Typography
							variant="h6"
							textAlign="center"
							sx={{ color: hues.green, fontWeight: 600 }}
						>
							{t("appDetails.securityVerificationSuccess")}
						</Typography>

						<Typography
							variant="body2"
							textAlign="center"
							sx={{ color: neutral[600], maxWidth: 380 }}
						>
							{t("appDetails.securityHashVerifiedExplanation")}
						</Typography>

						<Typography
							variant="body2"
							sx={{ color: neutral[800], fontFamily: "monospace" }}
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
								borderColor: lines.strong,
								color: neutral[600],
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
								borderColor: lines.strong,
								color: neutral[600],
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
