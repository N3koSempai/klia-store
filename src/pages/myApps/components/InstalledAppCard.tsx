import { DeleteOutline, History, Update } from "@mui/icons-material";
import {
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	IconButton,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { CachedImage } from "../../../components/CachedImage";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";

interface InstalledAppCardProps {
	app: InstalledAppInfo;
	hasUpdate: boolean;
	isUpdating: boolean;
	isUninstalling: boolean;
	cardHeight: number;
	onUpdate: () => void;
	onUninstall: () => void;
	onShowReleaseNotes: () => void;
}

const InstalledAppCardComponent = ({
	app,
	hasUpdate,
	isUpdating,
	isUninstalling,
	cardHeight,
	onUpdate,
	onUninstall,
	onShowReleaseNotes,
}: InstalledAppCardProps) => {
	const { t } = useTranslation();

	return (
		<Card
			elevation={0}
			sx={{
				height: cardHeight,
				display: "flex",
				flexDirection: "column",
				position: "relative",
				borderRadius: 4,
				backgroundColor: "background.paper",
				border: "1px solid",
				borderColor: "rgba(255, 255, 255, 0.1)",
				transition: "all 0.3s ease-in-out",
				willChange: "transform, box-shadow, border-color",
				"&:hover": {
					transform: "translateY(-5px)",
					borderColor: "primary.main",
					boxShadow: "0 8px 24px -4px rgba(0,0,0,0.6)",
					zIndex: 1,
				},
			}}
		>
			{/* --- ZONA SUPERIOR: ACCIONES SECUNDARIAS Y DESTRUCTIVAS --- */}
			<Stack
				direction="row"
				spacing={1}
				sx={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
			>
				{/* Botón para ver el Changelog/Release Notes */}
				{hasUpdate && (
					<Tooltip title={t("appDetails.releaseNotes")}>
						<IconButton
							onClick={onShowReleaseNotes}
							size="small"
							sx={{
								color: "text.secondary",
								border: "1px solid rgba(255,255,255,0.1)",
								"&:hover": {
									color: "info.main",
									backgroundColor: "rgba(88, 166, 255, 0.1)",
									borderColor: "info.main",
								},
							}}
						>
							<History fontSize="small" />
						</IconButton>
					</Tooltip>
				)}

				{/* Botón de Eliminar */}
				<Tooltip title={t("appDetails.uninstall")}>
					<IconButton
						onClick={onUninstall}
						disabled={isUninstalling}
						size="small"
						sx={{
							color: "text.secondary",
							"&:hover": {
								color: "error.main",
								backgroundColor: "rgba(255, 107, 107, 0.1)",
							},
							"&.Mui-disabled": {
								color: "grey.500",
							},
						}}
					>
						<DeleteOutline fontSize="small" />
					</IconButton>
				</Tooltip>
			</Stack>

			<CardContent
				sx={{
					flexGrow: 1,
					p: 3,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				{/* Icono de la App - Más grande y con sombra */}
				<Avatar
					variant="rounded"
					sx={{
						width: 72,
						height: 72,
						mb: 2,
						mt: 1,
						bgcolor: "transparent",
						filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))",
					}}
				>
					<CachedImage
						appId={app.appId}
						imageUrl={`https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${app.appId}.png`}
						alt={app.name}
						variant="rounded"
						style={{
							width: "100%",
							height: "100%",
							objectFit: "cover",
						}}
					/>
				</Avatar>

				{/* Título */}
				<Typography
					variant="h6"
					component="h2"
					fontWeight="bold"
					color="text.primary"
					align="center"
					gutterBottom
					sx={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						fontSize: "1rem",
					}}
				>
					{app.name}
				</Typography>

				{/* Developer como Chip pequeño */}
				{app.developer && (
					<Chip
						label={app.developer}
						size="small"
						variant="outlined"
						sx={{
							mb: 2,
							color: "text.secondary",
							borderColor: "rgba(255,255,255,0.1)",
							maxWidth: "100%",
						}}
					/>
				)}

				{/* Descripción */}
				{app.summary && (
					<Typography
						variant="body2"
						color="text.secondary"
						align="center"
						sx={{
							mb: 1,
							display: "-webkit-box",
							overflow: "hidden",
							WebkitBoxOrient: "vertical",
							WebkitLineClamp: 2,
							flexGrow: 1,
						}}
					>
						{app.summary}
					</Typography>
				)}

				{/* --- ZONA INFERIOR: ID TÉCNICO Y ACCIÓN PRINCIPAL --- */}
				<Box
					sx={{
						width: "100%",
						mt: "auto",
						pt: 1,
						borderTop: "1px solid rgba(255,255,255,0.05)",
						display: "flex",
						flexDirection: "column",
						gap: 1,
					}}
				>
					{/* ID Técnico (Más discreto arriba del botón) */}
					<Typography
						variant="caption"
						align="center"
						sx={{
							fontFamily: "monospace",
							color: "text.secondary",
							opacity: 0.5,
							fontSize: "0.65rem",
						}}
					>
						{app.appId}
					</Typography>

					{/* Botón Principal de Actualizar */}
					{hasUpdate && (
						<Button
							onClick={onUpdate}
							variant="contained"
							size="small"
							startIcon={<Update />}
							disabled={isUpdating}
							fullWidth
							sx={{
								backgroundColor: "primary.main",
								color: "#fff",
								fontWeight: 600,
								textTransform: "none",
								borderRadius: 2,
								py: 1,
								boxShadow: "0 4px 12px rgba(74, 134, 207, 0.3)",
								"&:hover": {
									backgroundColor: "primary.dark",
									boxShadow: "0 6px 16px rgba(74, 134, 207, 0.5)",
								},
								"&.Mui-disabled": {
									backgroundColor: "grey.600",
									color: "grey.400",
								},
							}}
						>
							{isUpdating
								? t("appDetails.updating")
								: `${t("appDetails.update")} v${app.version}`}
						</Button>
					)}

					{/* Si no hay actualización, mostramos la versión actual */}
					{!hasUpdate && (
						<Chip
							label={`v${app.version}`}
							size="small"
							sx={{
								backgroundColor: "rgba(88, 166, 255, 0.1)",
								color: "info.main",
								fontWeight: 600,
								height: 28,
								alignSelf: "center",
							}}
						/>
					)}
				</Box>
			</CardContent>
		</Card>
	);
};

// Memoize component to prevent unnecessary re-renders
export const InstalledAppCard = memo(InstalledAppCardComponent, (prevProps, nextProps) => {
	// Return true if props are equal (skip re-render)
	return (
		prevProps.app.appId === nextProps.app.appId &&
		prevProps.app.name === nextProps.app.name &&
		prevProps.app.version === nextProps.app.version &&
		prevProps.app.summary === nextProps.app.summary &&
		prevProps.app.developer === nextProps.app.developer &&
		prevProps.hasUpdate === nextProps.hasUpdate &&
		prevProps.isUpdating === nextProps.isUpdating &&
		prevProps.isUninstalling === nextProps.isUninstalling &&
		prevProps.cardHeight === nextProps.cardHeight
	);
});
