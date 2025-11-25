import { Apps, Close, CropSquare, FilterNone, Remove } from "@mui/icons-material";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const TitleBar = () => {
	const theme = useTheme();
	const [appWindow, setAppWindow] = useState<ReturnType<typeof getCurrentWindow> | null>(null);
	const [isMaximized, setIsMaximized] = useState(false);

	// Inicializar la ventana de Tauri
	useEffect(() => {
		const win = getCurrentWindow();
		setAppWindow(win);
	}, []);

	const handleMinimize = () => appWindow?.minimize();

	const handleMaximize = async () => {
		if (appWindow) {
			const maximized = await appWindow.isMaximized();
			await appWindow.toggleMaximize();
			setIsMaximized(!maximized);
		}
	};

	const handleClose = () => appWindow?.close();

	return (
		<Box
			data-tauri-drag-region
			sx={{
				height: "40px",
				width: "100%",
				backgroundColor: "background.default",
				borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				position: "fixed",
				top: 0,
				left: 0,
				zIndex: 9999,
				userSelect: "none",
				WebkitAppRegion: "drag",
			}}
		>
			{/* IZQUIERDA: Icono */}
			<Box
				sx={{
					position: "absolute",
					left: 16,
					pointerEvents: "none",
				}}
			>
				<Apps sx={{ fontSize: 18, color: theme.palette.primary.main }} />
			</Box>

			{/* CENTRO: Título */}
			<Typography
				variant="caption"
				sx={{
					fontWeight: 600,
					color: "text.secondary",
					textTransform: "uppercase",
					letterSpacing: "0.08em",
					fontSize: "0.75rem",
					pointerEvents: "none",
				}}
			>
				Klia Store
			</Typography>

			{/* DERECHA: Controles */}
			<Stack
				direction="row"
				sx={{
					WebkitAppRegion: "no-drag",
					position: "absolute",
					right: 0,
				}}
			>
				{/* Minimizar */}
				<WindowButton onClick={handleMinimize}>
					<Remove sx={{ fontSize: 16 }} />
				</WindowButton>

				{/* Maximizar / Restaurar */}
				<WindowButton onClick={handleMaximize}>
					{isMaximized ? (
						<FilterNone sx={{ fontSize: 14 }} />
					) : (
						<CropSquare sx={{ fontSize: 16 }} />
					)}
				</WindowButton>

				{/* Cerrar (Rojo al hover) */}
				<WindowButton onClick={handleClose} isClose>
					<Close sx={{ fontSize: 18 }} />
				</WindowButton>
			</Stack>
		</Box>
	);
};

// Componente auxiliar para los botones
interface WindowButtonProps {
	children: React.ReactNode;
	onClick: () => void;
	isClose?: boolean;
}

const WindowButton = ({ children, onClick, isClose }: WindowButtonProps) => (
	<Box
		onClick={onClick}
		sx={{
			width: 46,
			height: 40,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			cursor: "default",
			color: "text.secondary",
			transition: "all 0.2s",
			"&:hover": {
				backgroundColor: isClose ? "#e81123" : "rgba(255, 255, 255, 0.05)",
				color: isClose ? "#fff" : "text.primary",
			},
		}}
	>
		{children}
	</Box>
);

export default TitleBar;
