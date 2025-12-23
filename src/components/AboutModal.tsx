import CloseIcon from "@mui/icons-material/Close";
import {
	Box,
	Dialog,
	DialogContent,
	Divider,
	IconButton,
	Paper,
	styled,
	Typography,
} from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import packageJson from "../../package.json";

interface AboutModalProps {
	open: boolean;
	onClose: () => void;
}

type AvailabilityStatus = "available" | "busy" | "unavailable";

const StatusIndicator = styled(Box)<{ status: AvailabilityStatus }>(
	({ status }) => {
		const colors = {
			available: "#4ade80",
			busy: "#fbbf24",
			unavailable: "#f87171",
		};

		return {
			width: 16,
			height: 16,
			borderRadius: "50%",
			backgroundColor: colors[status],
			boxShadow: `0 0 10px ${colors[status]}, 0 0 20px ${colors[status]}`,
			animation: "pulse 2s ease-in-out infinite",
			"@keyframes pulse": {
				"0%, 100%": {
					opacity: 1,
					boxShadow: `0 0 10px ${colors[status]}, 0 0 20px ${colors[status]}`,
				},
				"50%": {
					opacity: 0.7,
					boxShadow: `0 0 15px ${colors[status]}, 0 0 25px ${colors[status]}`,
				},
			},
		};
	},
);

export const AboutModal = ({ open, onClose }: AboutModalProps) => {
	const { t } = useTranslation();
	const currentStatus: AvailabilityStatus = "busy";

	const handleOpenLink = async (url: string) => {
		try {
			await openUrl(url);
		} catch (error) {
			console.error("Error opening link:", error);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
			<IconButton
				onClick={onClose}
				sx={{
					position: "absolute",
					right: 8,
					top: 8,
					color: "grey.500",
					zIndex: 1,
				}}
			>
				<CloseIcon />
			</IconButton>

			<DialogContent sx={{ p: 4 }}>
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 2,
					}}
				>
					{/* Main Title */}
					<Typography
						variant="h3"
						component="h1"
						sx={{
							fontWeight: "bold",
							textAlign: "center",
							background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
						}}
					>
						Klia Store
					</Typography>

					{/* Version */}
					<Typography variant="body1" color="text.secondary">
						{t("about.version")} {packageJson.version}
					</Typography>

					{/* Description */}
					<Typography
						variant="body1"
						color="text.secondary"
						sx={{
							textAlign: "center",
							maxWidth: "600px",
							lineHeight: 1.7,
							mt: 1,
						}}
					>
						{t("about.description")}
					</Typography>

					{/* Creator Section - Highlighted */}
					<Paper
						elevation={3}
						sx={{
							p: 3,
							width: "100%",
							maxWidth: "500px",
							textAlign: "center",
							background:
								"linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(66, 165, 245, 0.05) 100%)",
							border: "1px solid rgba(25, 118, 210, 0.2)",
							mt: 2,
						}}
					>
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{ mb: 2, textTransform: "uppercase", letterSpacing: 1 }}
						>
							{t("about.createdBy")}
						</Typography>

						<Typography variant="h5" sx={{ mb: 2, fontWeight: "bold" }}>
							Alvaro M
						</Typography>

						<Box
							component="button"
							onClick={() => handleOpenLink("https://alvaromweb3.com/")}
							sx={{
								color: "primary.main",
								textDecoration: "none",
								fontSize: "1.1rem",
								"&:hover": { textDecoration: "underline" },
								mb: 3,
								cursor: "pointer",
								border: "none",
								background: "transparent",
								padding: 0,
								font: "inherit",
								textAlign: "center",
								display: "inline-block",
								boxShadow: "none",
								"&:focus": { outline: "none", boxShadow: "none" },
								"&:active": { boxShadow: "none" },
							}}
						>
							@nekosempai
						</Box>

						{/* Availability Status */}
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 2,
								mt: 2,
								p: 2,
								borderRadius: 2,
								bgcolor: "rgba(0, 0, 0, 0.2)",
							}}
						>
							<StatusIndicator status={currentStatus} />
							<Box sx={{ textAlign: "left" }}>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ display: "block", mb: 0.5 }}
								>
									{t("about.availabilityLabel")}
								</Typography>
								<Typography variant="body2" sx={{ fontWeight: "bold" }}>
									{t(`about.availabilityStatus.${currentStatus}`)}
								</Typography>
							</Box>
						</Box>
					</Paper>

					<Divider sx={{ width: "100%", my: 1 }} />

					{/* Links Section */}
					<Box
						sx={{
							display: "flex",
							gap: 4,
							justifyContent: "center",
							flexWrap: "wrap",
						}}
					>
						<Box sx={{ textAlign: "center" }}>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 1, fontWeight: "bold" }}
							>
								{t("about.license")}
							</Typography>
							<Box
								component="button"
								onClick={() =>
									handleOpenLink(
										"https://github.com/N3koSempai/KliaStore/blob/master/LICENSE.md",
									)
								}
								sx={{
									color: "primary.main",
									textDecoration: "none",
									"&:hover": { textDecoration: "underline" },
									cursor: "pointer",
									border: "none",
									background: "transparent",
									padding: 0,
									font: "inherit",
									boxShadow: "none",
									"&:focus": { outline: "none", boxShadow: "none" },
									"&:active": { boxShadow: "none" },
								}}
							>
								{t("about.viewLicense")}
							</Box>
						</Box>

						<Box sx={{ textAlign: "center" }}>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 1, fontWeight: "bold" }}
							>
								{t("about.contributing")}
							</Typography>
							<Box
								component="button"
								onClick={() =>
									handleOpenLink(
										"https://github.com/N3koSempai/KliaStore/blob/master/CONTRIBUTING.md",
									)
								}
								sx={{
									color: "primary.main",
									textDecoration: "none",
									"&:hover": { textDecoration: "underline" },
									cursor: "pointer",
									border: "none",
									background: "transparent",
									padding: 0,
									font: "inherit",
									boxShadow: "none",
									"&:focus": { outline: "none", boxShadow: "none" },
									"&:active": { boxShadow: "none" },
								}}
							>
								{t("about.viewContributing")}
							</Box>
						</Box>
					</Box>
				</Box>
			</DialogContent>
		</Dialog>
	);
};
