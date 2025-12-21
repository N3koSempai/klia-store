import { ExpandMore } from "@mui/icons-material";
import {
	Box,
	Chip,
	List,
	ListItem,
	ListItemText,
	Popover,
	Skeleton,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Dependency } from "../hooks/useRuntimeCheck";

interface DependencyStatusCardProps {
	dependencies: Dependency[];
	loading: boolean;
}

export const DependencyStatusCard = ({
	dependencies,
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
	if (loading) {
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

	// If no dependencies, don't show anything (app already installed or error)
	if (dependencies.length === 0) {
		return null;
	}

	// Calculate total download size
	const totalDownloadMB = dependencies.reduce((total, dep) => {
		const match = dep.download_size.match(/(\d+\.?\d*)\s*(MB|GB|kB)/);
		if (match) {
			const value = Number.parseFloat(match[1]);
			const unit = match[2];
			if (unit === "GB") return total + value * 1024;
			if (unit === "MB") return total + value;
			if (unit === "kB") return total + value / 1024;
		}
		return total;
	}, 0);

	const displaySize =
		totalDownloadMB >= 1024
			? `${(totalDownloadMB / 1024).toFixed(1)} GB`
			: `${totalDownloadMB.toFixed(1)} MB`;

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
							bgcolor: "#F6D32D",
							ml: 1,
						}}
					/>
				}
				label={`${dependencies.length} ${t("dependency.dependenciesToDownload")} (${displaySize})`}
				deleteIcon={<ExpandMore sx={{ fontSize: 20 }} />}
				onDelete={handleClick}
				onClick={handleClick}
				sx={{
					bgcolor: "rgba(246, 211, 45, 0.1)",
					color: "#F6D32D",
					border: "1px solid rgba(246, 211, 45, 0.3)",
					fontFamily: "IBM Plex Sans, sans-serif",
					fontSize: "0.875rem",
					fontWeight: 600,
					height: 36,
					px: 1.5,
					cursor: "pointer",
					transition: "all 0.2s ease-in-out",
					"&:hover": {
						bgcolor: "rgba(246, 211, 45, 0.15)",
						borderColor: "rgba(246, 211, 45, 0.5)",
					},
					"& .MuiChip-deleteIcon": {
						color: "#F6D32D",
						"&:hover": {
							color: "#f8e45c",
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
						{t("dependency.installationRequirements")}
					</Typography>

					<List dense disablePadding>
						{dependencies.map((dep) => (
							<ListItem
								key={dep.name}
								sx={{
									px: 0,
									py: 1,
									borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
									display: "flex",
									flexDirection: "column",
									alignItems: "flex-start",
								}}
							>
								<ListItemText
									primary={dep.name}
									primaryTypographyProps={{
										sx: {
											fontFamily: "JetBrains Mono, monospace",
											fontSize: "0.8rem",
											color: "#F6D32D",
											wordBreak: "break-all",
										},
									}}
								/>
								<Box
									sx={{
										display: "flex",
										gap: 2,
										mt: 0.5,
										width: "100%",
									}}
								>
									<Typography
										sx={{
											fontFamily: "Inter, sans-serif",
											fontSize: "0.75rem",
											color: "#8B949E",
										}}
									>
										{t("dependency.download")}: {dep.download_size}
									</Typography>
									<Typography
										sx={{
											fontFamily: "Inter, sans-serif",
											fontSize: "0.75rem",
											color: "#8B949E",
										}}
									>
										{t("dependency.installed")}: {dep.installed_size}
									</Typography>
								</Box>
							</ListItem>
						))}
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
						{t("dependency.willBeDownloadedNote")}
					</Typography>
				</Box>
			</Popover>
		</>
	);
};
