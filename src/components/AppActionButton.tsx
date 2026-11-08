import DownloadRounded from "@mui/icons-material/DownloadRounded";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import { Button, CircularProgress } from "@mui/material";
import { useTranslation } from "react-i18next";

type AppStatus = "installed" | "missing" | "busy" | "verifying";
type BusyAction = "installing" | "uninstalling" | "verifying";

interface AppActionButtonProps {
	status: AppStatus;
	busyAction?: BusyAction;
	onAction: () => void;
	fullWidth?: boolean;
}

// La apariencia (alto, radio, tipografía, estados) viene del tema; aquí solo
// se elige el rol: éxito para lanzar, primario para instalar, soft mientras
// hay trabajo en curso.
export const AppActionButton = ({
	status,
	busyAction = "installing",
	onAction,
	fullWidth = false,
}: AppActionButtonProps) => {
	const { t } = useTranslation();

	if (status === "installed") {
		return (
			<Button
				variant="contained"
				color="success"
				size="large"
				onClick={onAction}
				endIcon={<LaunchRounded />}
				fullWidth={fullWidth}
			>
				{t("appDetails.launch")}
			</Button>
		);
	}

	if (status === "verifying") {
		return (
			<Button
				variant="soft"
				color="primary"
				size="large"
				disabled
				startIcon={<CircularProgress size={18} color="inherit" />}
				fullWidth={fullWidth}
			>
				{t("appDetails.verifyingSecurity")}
			</Button>
		);
	}

	if (status === "busy") {
		return (
			<Button
				variant="soft"
				color="neutral"
				size="large"
				disabled
				startIcon={<CircularProgress size={18} color="inherit" />}
				fullWidth={fullWidth}
			>
				{busyAction === "uninstalling"
					? t("appDetails.uninstalling")
					: t("appDetails.installing")}
			</Button>
		);
	}

	return (
		<Button
			variant="contained"
			size="large"
			onClick={onAction}
			startIcon={<DownloadRounded />}
			fullWidth={fullWidth}
		>
			{t("appDetails.install")}
		</Button>
	);
};
