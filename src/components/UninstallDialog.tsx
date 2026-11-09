import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { radius } from "../theme/tokens";
import { AppDialog } from "./ui/AppDialog";

interface UninstallDialogProps {
	open: boolean;
	appId: string;
	appName: string;
	onCancel: () => void;
	onConfirm: (deleteData: boolean) => void;
}

// Pregunta qué hacer con los datos del usuario antes de desinstalar un
// flatpak. La acción primaria (relleno) conserva los datos porque es la
// reversible; borrarlos es secundaria y en rojo, así no se pulsa por inercia.
export const UninstallDialog = ({
	open,
	appId,
	appName,
	onCancel,
	onConfirm,
}: UninstallDialogProps) => {
	const { t } = useTranslation();

	return (
		<AppDialog
			open={open}
			onClose={onCancel}
			title={t("uninstallDialog.title", { name: appName })}
			actions={
				<>
					<Button
						onClick={onCancel}
						variant="text"
						color="neutral"
						sx={{ mr: "auto" }}
					>
						{t("uninstallDialog.cancel")}
					</Button>
					<Button variant="soft" color="error" onClick={() => onConfirm(true)}>
						{t("uninstallDialog.confirmDelete")}
					</Button>
					<Button
						variant="contained"
						onClick={() => onConfirm(false)}
						autoFocus
					>
						{t("uninstallDialog.confirm")}
					</Button>
				</>
			}
		>
			<Typography color="text.secondary">
				{t("uninstallDialog.description")}
			</Typography>
			<Box
				sx={(theme) => ({
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					p: 1.5,
					borderRadius: `${radius.md}px`,
					border: `1px solid ${theme.tokens.border.subtle}`,
					bgcolor: theme.tokens.surface.sunken,
					color: "text.secondary",
				})}
			>
				<FolderOpenOutlined fontSize="small" />
				<Typography
					variant="caption"
					sx={{
						fontFamily: "JetBrains Mono, monospace",
						wordBreak: "break-all",
					}}
				>
					~/.var/app/{appId}
				</Typography>
			</Box>
		</AppDialog>
	);
};
