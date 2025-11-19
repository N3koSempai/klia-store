import {
	Box,
	Button,
	Dialog,
	DialogContent,
	LinearProgress,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { Terminal } from "./Terminal";

interface UpdateAllModalProps {
	open: boolean;
	totalApps: number;
	currentAppIndex: number;
	currentAppName: string;
	currentAppProgress: number;
	output: string[];
	isUpdating: boolean;
	onClose: () => void;
	showTerminal: boolean;
	onToggleTerminal: () => void;
}

export const UpdateAllModal = ({
	open,
	totalApps,
	currentAppIndex,
	currentAppName,
	currentAppProgress,
	output,
	isUpdating,
	onClose,
	showTerminal,
	onToggleTerminal,
}: UpdateAllModalProps) => {
	const { t } = useTranslation();

	// Calculate overall progress
	const overallProgress =
		totalApps > 0 ? ((currentAppIndex / totalApps) * 100) : 0;

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

				{/* Overall Progress */}
				<Box sx={{ mb: 3 }}>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							mb: 1,
						}}
					>
						<Typography variant="body2" color="text.secondary">
							{t("myApps.overallProgress")}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{currentAppIndex} / {totalApps}
						</Typography>
					</Box>
					<LinearProgress
						variant="determinate"
						value={overallProgress}
						sx={{ height: 8, borderRadius: 1 }}
					/>
				</Box>

				{/* Current App Progress */}
				<Box sx={{ mb: 3 }}>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							mb: 1,
						}}
					>
						<Typography variant="body2" color="text.secondary">
							{t("myApps.currentApp")}
						</Typography>
						<Typography
							variant="body2"
							color="primary"
							sx={{ fontWeight: "bold" }}
						>
							{currentAppName || t("myApps.waiting")}
						</Typography>
					</Box>
					<LinearProgress
						variant={currentAppProgress >= 0 ? "determinate" : "indeterminate"}
						value={currentAppProgress}
						sx={{ height: 8, borderRadius: 1 }}
					/>
				</Box>

				{/* Terminal Section */}
				<Box sx={{ mb: 2 }}>
					<Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
						<Button
							variant="outlined"
							size="small"
							onClick={onToggleTerminal}
							sx={{
								borderColor: "divider",
								color: "text.secondary",
								"&:hover": {
									borderColor: "primary.main",
									bgcolor: "action.hover",
								},
							}}
						>
							{showTerminal
								? t("myApps.hideDetails")
								: t("myApps.showDetails")}
						</Button>
					</Box>

					{showTerminal && (
						<Box
							sx={{
								maxHeight: 200,
								overflow: "auto",
								filter: "blur(0px)",
								opacity: 1,
								transition: "all 0.3s ease",
							}}
						>
							<Terminal output={output} isRunning={isUpdating} />
						</Box>
					)}

					{!showTerminal && output.length > 0 && (
						<Box
							sx={{
								maxHeight: 100,
								overflow: "hidden",
								filter: "blur(2px)",
								opacity: 0.5,
								pointerEvents: "none",
								transition: "all 0.3s ease",
							}}
						>
							<Terminal output={output} isRunning={isUpdating} />
						</Box>
					)}
				</Box>

				{/* Close Button */}
				{!isUpdating && (
					<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
						<Button variant="contained" onClick={onClose}>
							{t("myApps.closeButton")}
						</Button>
					</Box>
				)}
			</DialogContent>
		</Dialog>
	);
};
