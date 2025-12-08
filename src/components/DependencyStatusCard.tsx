import { CheckCircle, CloudDownload, ExpandMore } from "@mui/icons-material";
import {
	Box,
	Chip,
	List,
	ListItem,
	ListItemIcon,
	ListItemText,
	Popover,
	Skeleton,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface DependencyStatusCardProps {
	runtimeRef: string | null;
	isInstalled: boolean;
	loading: boolean;
}

export const DependencyStatusCard = ({
	runtimeRef,
	isInstalled,
	loading,
}: DependencyStatusCardProps) => {
	const { t } = useTranslation();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	const handleClick = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const open = Boolean(anchorEl);

	// Always show skeleton while loading to reserve space
	if (loading || !runtimeRef) {
		return (
			<Skeleton
				variant="rounded"
				width={180}
				height={36}
				sx={{
					bgcolor: "rgba(255, 255, 255, 0.05)",
					borderRadius: "18px",
				}}
			/>
		);
	}

	return (
		<>
			<Chip
				icon={
					<Box
						component="span"
						sx={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							bgcolor: isInstalled ? "#238636" : "#F6D32D",
							ml: 1,
						}}
					/>
				}
				label={
					isInstalled
						? t("dependency.runtimeReady")
						: t("dependency.runtimeDownload")
				}
				deleteIcon={<ExpandMore sx={{ fontSize: 20 }} />}
				onDelete={handleClick}
				onClick={handleClick}
				sx={{
					bgcolor: isInstalled
						? "rgba(35, 134, 54, 0.1)"
						: "rgba(246, 211, 45, 0.1)",
					color: isInstalled ? "#238636" : "#F6D32D",
					border: `1px solid ${isInstalled ? "rgba(35, 134, 54, 0.3)" : "rgba(246, 211, 45, 0.3)"}`,
					fontFamily: "IBM Plex Sans, sans-serif",
					fontSize: "0.875rem",
					fontWeight: 600,
					height: 36,
					px: 1.5,
					cursor: "pointer",
					transition: "all 0.2s ease-in-out",
					"&:hover": {
						bgcolor: isInstalled
							? "rgba(35, 134, 54, 0.15)"
							: "rgba(246, 211, 45, 0.15)",
						borderColor: isInstalled
							? "rgba(35, 134, 54, 0.5)"
							: "rgba(246, 211, 45, 0.5)",
					},
					"& .MuiChip-deleteIcon": {
						color: isInstalled ? "#238636" : "#F6D32D",
						"&:hover": {
							color: isInstalled ? "#2ea043" : "#f8e45c",
						},
					},
				}}
			/>

			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{
					vertical: "bottom",
					horizontal: "left",
				}}
				transformOrigin={{
					vertical: "top",
					horizontal: "left",
				}}
				slotProps={{
					paper: {
						sx: {
							bgcolor: "#161B22",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							borderRadius: 2,
							mt: 1,
							minWidth: 400,
							maxWidth: 600,
						},
					},
				}}
			>
				<Box sx={{ p: 2 }}>
					<Typography
						sx={{
							fontFamily: "IBM Plex Sans, sans-serif",
							fontSize: "0.875rem",
							fontWeight: 600,
							color: "#C9D1D9",
							mb: 1.5,
						}}
					>
						{t("dependency.runtimeDependencies")}
					</Typography>

					<List dense disablePadding>
						<ListItem
							sx={{
								px: 0,
								py: 1,
								borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
							}}
						>
							<ListItemIcon sx={{ minWidth: 32 }}>
								{isInstalled ? (
									<CheckCircle sx={{ fontSize: 20, color: "#238636" }} />
								) : (
									<CloudDownload sx={{ fontSize: 20, color: "#F6D32D" }} />
								)}
							</ListItemIcon>
							<ListItemText
								primary={runtimeRef}
								primaryTypographyProps={{
									sx: {
										fontFamily: "JetBrains Mono, monospace",
										fontSize: "0.8rem",
										color: isInstalled ? "#238636" : "#F6D32D",
										wordBreak: "break-all",
									},
								}}
								secondary={
									isInstalled
										? t("dependency.alreadyInstalled")
										: t("dependency.willBeDownloaded")
								}
								secondaryTypographyProps={{
									sx: {
										fontFamily: "Inter, sans-serif",
										fontSize: "0.75rem",
										color: "#8B949E",
										mt: 0.5,
									},
								}}
							/>
						</ListItem>
					</List>

					<Typography
						sx={{
							fontFamily: "Inter, sans-serif",
							fontSize: "0.75rem",
							color: "#8B949E",
							mt: 2,
							fontStyle: "italic",
						}}
					>
						{isInstalled
							? t("dependency.fastInstallationNote")
							: t("dependency.largerDownloadNote")}
					</Typography>
				</Box>
			</Popover>
		</>
	);
};
