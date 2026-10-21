import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ProgressStage } from "../../../hooks/useBackups";

// Replaces the old raw console-log view: instead of a scrolling terminal of
// every backend message, only the current stage is shown — a spinner, the
// latest action as a single line that swaps in place, and (when the backend
// reports [i/total]) which app of the batch is being processed. Matches the
// "one big step, not a log" pattern of installer-style progress UIs.
export function StageIndicator({
	stage,
	fallback,
}: {
	stage: ProgressStage;
	fallback: string;
}) {
	const { t } = useTranslation();
	return (
		<Stack direction="row" alignItems="flex-start" spacing={2} sx={{ py: 1 }}>
			<CircularProgress
				size={28}
				thickness={4}
				sx={{ mt: "2px", flexShrink: 0 }}
			/>
			<Box sx={{ minWidth: 0, flex: 1 }}>
				{stage.stepTotal !== null && (
					<Typography
						variant="overline"
						color="primary"
						sx={{ display: "block", lineHeight: 1.4, fontWeight: 700 }}
					>
						{t("backups.stepCount", {
							index: stage.stepIndex,
							total: stage.stepTotal,
						})}
					</Typography>
				)}
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						lineHeight: 1.5,
						wordBreak: "break-word",
						overflowWrap: "anywhere",
					}}
				>
					{stage.message || fallback}
				</Typography>
			</Box>
		</Stack>
	);
}
