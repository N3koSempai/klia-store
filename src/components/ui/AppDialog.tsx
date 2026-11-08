import {
	Box,
	Dialog,
	DialogActions,
	DialogContent,
	type DialogProps,
	DialogTitle,
	Typography,
} from "@mui/material";
import type { ReactNode } from "react";

interface AppDialogProps
	extends Pick<
		DialogProps,
		"open" | "onClose" | "maxWidth" | "scroll" | "disableScrollLock"
	> {
	title: ReactNode;
	subtitle?: ReactNode;
	// Acciones alineadas a la derecha; la que avanza va la última (cap. 6h).
	actions?: ReactNode;
	// Línea divisoria alrededor del contenido (útil si hace scroll).
	dividers?: boolean;
	children: ReactNode;
}

// Estructura estándar de diálogo: título + subtítulo, contenido y acciones.
// La apariencia (superficie, borde, radio, sombra) viene del tema.
export const AppDialog = ({
	title,
	subtitle,
	actions,
	dividers = false,
	children,
	maxWidth = "sm",
	...dialogProps
}: AppDialogProps) => (
	<Dialog fullWidth maxWidth={maxWidth} {...dialogProps}>
		<DialogTitle>
			{title}
			{subtitle && (
				<Typography
					variant="body2"
					color="text.secondary"
					component="div"
					sx={{ fontWeight: 400, mt: 0.5 }}
				>
					{subtitle}
				</Typography>
			)}
		</DialogTitle>
		<DialogContent dividers={dividers}>
			<Box sx={{ display: "grid", gap: 2 }}>{children}</Box>
		</DialogContent>
		{actions && <DialogActions>{actions}</DialogActions>}
	</Dialog>
);
