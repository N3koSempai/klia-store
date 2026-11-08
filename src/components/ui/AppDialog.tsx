import CloseRounded from "@mui/icons-material/CloseRounded";
import {
	Box,
	Dialog,
	DialogActions,
	DialogContent,
	type DialogProps,
	DialogTitle,
	IconButton,
	Typography,
} from "@mui/material";
import type { ReactNode } from "react";

interface AppDialogProps
	extends Pick<
		DialogProps,
		"open" | "onClose" | "maxWidth" | "scroll" | "disableScrollLock"
	> {
	title?: ReactNode;
	subtitle?: ReactNode;
	// Acciones alineadas a la derecha; la que avanza va la última (cap. 6h).
	actions?: ReactNode;
	// Línea divisoria alrededor del contenido (útil si hace scroll).
	dividers?: boolean;
	// Si se pasa, se muestra un icono de cerrar arriba a la derecha con este
	// aria-label. Requiere `onClose`.
	closeLabel?: string;
	// Padding del contenido cuando el diálogo no lleva título (p. ej. "Acerca de").
	contentPadding?: number;
	children: ReactNode;
}

// Estructura estándar de diálogo: título + subtítulo, contenido y acciones.
// La apariencia (superficie, borde, radio, sombra) viene del tema.
export const AppDialog = ({
	title,
	subtitle,
	actions,
	dividers = false,
	closeLabel,
	contentPadding,
	children,
	maxWidth = "sm",
	onClose,
	...dialogProps
}: AppDialogProps) => (
	<Dialog fullWidth maxWidth={maxWidth} onClose={onClose} {...dialogProps}>
		{closeLabel && onClose && (
			<IconButton
				aria-label={closeLabel}
				onClick={(e) => onClose(e, "backdropClick")}
				color="neutral"
				size="small"
				sx={{ position: "absolute", right: 12, top: 12, zIndex: 1 }}
			>
				<CloseRounded fontSize="small" />
			</IconButton>
		)}
		{title && (
			<DialogTitle sx={closeLabel ? { pr: 7 } : undefined}>
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
		)}
		<DialogContent
			dividers={dividers}
			sx={contentPadding !== undefined ? { p: contentPadding } : undefined}
		>
			<Box sx={{ display: "grid", gap: 2 }}>{children}</Box>
		</DialogContent>
		{actions && <DialogActions>{actions}</DialogActions>}
	</Dialog>
);
