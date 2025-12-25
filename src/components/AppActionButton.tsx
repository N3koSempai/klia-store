import DownloadRounded from "@mui/icons-material/DownloadRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import { Button, CircularProgress } from "@mui/material";
import { useTranslation } from "react-i18next";

type AppStatus = "installed" | "missing" | "busy";
type BusyAction = "installing" | "uninstalling";

interface AppActionButtonProps {
	status: AppStatus;
	busyAction?: BusyAction;
	onAction: () => void;
	fullWidth?: boolean;
}

export const AppActionButton = ({
	status,
	busyAction = "installing",
	onAction,
	fullWidth = false,
}: AppActionButtonProps) => {
	const { t } = useTranslation();
	// State: INSTALLED - Ready to Launch
	if (status === "installed") {
		return (
			<Button
				variant="contained"
				size="large"
				onClick={onAction}
				endIcon={<LaunchRounded />}
				fullWidth={fullWidth}
				sx={{
					py: 1.5,
					fontSize: "1rem",
					fontWeight: 600,
					fontFamily: "Inter, sans-serif",
					bgcolor: "#238636",
					color: "white",
					textTransform: "uppercase",
					"&:hover": {
						bgcolor: "#2EA043",
					},
				}}
			>
				{t("appDetails.launch")}
			</Button>
		);
	}

	// State: BUSY - System Working
	if (status === "busy") {
		return (
			<Button
				variant="outlined"
				size="large"
				disabled
				startIcon={<CircularProgress size={18} color="inherit" />}
				fullWidth={fullWidth}
				sx={{
					py: 1.5,
					fontSize: "1rem",
					fontWeight: 600,
					fontFamily: "Inter, sans-serif",
					color: "text.secondary",
					borderColor: "action.disabledBackground",
					textTransform: "capitalize",
				}}
			>
				{busyAction === "uninstalling" ? t("appDetails.uninstalling") : t("appDetails.installing")}
			</Button>
		);
	}

	// State: NOT INSTALLED - Call to Action
	return (
		<Button
			variant="contained"
			size="large"
			onClick={onAction}
			startIcon={<DownloadRounded />}
			fullWidth={fullWidth}
			sx={{
				py: 1.5,
				fontSize: "1rem",
				fontWeight: 600,
				fontFamily: "Inter, sans-serif",
				bgcolor: "#4A86CF",
				color: "white",
				textTransform: "uppercase",
				"&:hover": {
					bgcolor: "#3A6FB5",
				},
			}}
		>
			{t("appDetails.install")}
		</Button>
	);
};
