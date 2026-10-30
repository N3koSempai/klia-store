import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

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
		<Dialog
			open={open}
			onClose={onCancel}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: "background.paper",
					backgroundImage: "none",
					border: "1px solid rgba(255,255,255,0.1)",
					borderRadius: 4,
					boxShadow: "0 8px 24px -4px rgba(0,0,0,0.6)",
				},
			}}
		>
			<DialogTitle sx={{ fontFamily: "IBM Plex Sans", fontWeight: 700, pt: 3 }}>
				{t("uninstallDialog.title", { name: appName })}
			</DialogTitle>
			<DialogContent>
				<Typography color="text.secondary" sx={{ mb: 2 }}>
					{t("uninstallDialog.description")}
				</Typography>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1.5,
						p: 1.5,
						borderRadius: 2,
						border: "1px solid rgba(255,255,255,0.1)",
						color: "text.secondary",
					}}
				>
					<FolderOpenOutlined fontSize="small" />
					<Typography
						variant="caption"
						sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
					>
						~/.var/app/{appId}
					</Typography>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
				<Button onClick={onCancel} color="inherit" sx={{ mr: "auto" }}>
					{t("uninstallDialog.cancel")}
				</Button>
				<Button
					variant="outlined"
					color="error"
					onClick={() => onConfirm(true)}
				>
					{t("uninstallDialog.confirmDelete")}
				</Button>
				<Button variant="contained" onClick={() => onConfirm(false)} autoFocus>
					{t("uninstallDialog.confirm")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
