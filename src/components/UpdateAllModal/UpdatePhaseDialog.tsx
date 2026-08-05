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
import { Terminal } from "../Terminal";

interface UpdatePhaseDialogProps {
	open: boolean;
	onClose: () => void;
	t: TFunction;
	isUpdating: boolean;
	updateOutput: string[];
	showTerminal: boolean;
	onToggleTerminal?: () => void;
	totalApps: number;
	currentAppIndex: number;
	currentAppName: string;
	currentAppProgress: number;
	isUpdatingSystem: boolean;
	systemUpdateProgress: number;
	systemUpdatesCount: number;
	updateSuccessCount: number;
	updateErrorCount: number;
}

export const UpdatePhaseDialog = memo(
	({
		open,
		onClose,
		t,
		isUpdating,
		updateOutput,
		showTerminal,
		onToggleTerminal,
		totalApps,
		currentAppIndex,
		currentAppName,
		currentAppProgress,
		isUpdatingSystem,
		systemUpdateProgress,
		systemUpdatesCount,
		updateSuccessCount,
		updateErrorCount,
	}: UpdatePhaseDialogProps) => {
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
	},
);

UpdatePhaseDialog.displayName = "UpdatePhaseDialog";
