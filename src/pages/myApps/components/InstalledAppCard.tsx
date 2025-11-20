import { Delete, Description } from "@mui/icons-material";
import {
	Box,
	Button,
	Card,
	CardContent,
	IconButton,
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
			sx={{
				display: "flex",
				flexDirection: "column",
				boxSizing: "border-box",
				minWidth: 0,
				height: cardHeight,
				overflow: "hidden",
				transition: "box-shadow 0.3s",
				"&:hover": { boxShadow: 6 },
			}}
		>
			<Box
				sx={{
					p: 2,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 1.5,
					bgcolor: "background.paper",
				}}
			>
				{/* App Icon */}
				<Box
					sx={{
						width: 96,
						height: 96,
						flexShrink: 0,
						borderRadius: 2,
						overflow: "hidden",
						bgcolor: "grey.800",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
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
				</Box>

				{/* App Name */}
				<Typography
					variant="body1"
					fontWeight="bold"
					textAlign="center"
					sx={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						minHeight: "2.5em",
						lineHeight: 1.25,
					}}
				>
					{app.name}
				</Typography>
			</Box>

			<CardContent sx={{ flexGrow: 1, pt: 1, pb: 2 }}>
				{/* App ID */}
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{
						display: "block",
						mb: 1,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{app.appId}
				</Typography>

				{/* Version and Action Buttons */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						gap: 1,
						mb: 1,
					}}
				>
					<Typography
						variant="caption"
						color="primary"
						sx={{
							fontWeight: "bold",
						}}
					>
						v{app.version}
					</Typography>

					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
						}}
					>
						{/* Uninstall Icon */}
						<IconButton
							size="small"
							onClick={onUninstall}
							disabled={isUninstalling}
							sx={{
								p: 0.5,
								bgcolor: "error.main",
								color: "white",
								"&:hover": {
									bgcolor: "error.dark",
								},
								"&.Mui-disabled": {
									bgcolor: "grey.500",
									color: "grey.300",
								},
							}}
						>
							<Delete fontSize="small" />
						</IconButton>

						{/* Release Notes Icon - only show if update available */}
						{hasUpdate && (
							<IconButton
								size="small"
								onClick={onShowReleaseNotes}
								sx={{
									p: 0.5,
									"&:hover": {
										color: "primary.main",
									},
								}}
							>
								<Description fontSize="small" />
							</IconButton>
						)}

						{/* Update Button - only show if update available */}
						{hasUpdate && (
							<Button
								variant="contained"
								size="small"
								onClick={onUpdate}
								disabled={isUpdating}
								sx={{
									minWidth: "auto",
									px: 1.5,
									py: 0.5,
									fontSize: "0.7rem",
									textTransform: "none",
								}}
							>
								{isUpdating ? t("appDetails.updating") : t("appDetails.update")}
							</Button>
						)}
					</Box>
				</Box>

				{/* App Summary - at the bottom */}
				{app.summary && (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{
							display: "-webkit-box",
							overflow: "hidden",
							textOverflow: "ellipsis",
							WebkitLineClamp: 2,
							WebkitBoxOrient: "vertical",
							lineHeight: 1.4,
						}}
					>
						{app.summary}
					</Typography>
				)}
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
		prevProps.hasUpdate === nextProps.hasUpdate &&
		prevProps.isUpdating === nextProps.isUpdating &&
		prevProps.isUninstalling === nextProps.isUninstalling &&
		prevProps.cardHeight === nextProps.cardHeight
	);
});
