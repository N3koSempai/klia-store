import CloseIcon from "@mui/icons-material/Close";
import EmailIcon from "@mui/icons-material/Email";
import {
	Box,
	Button,
	Dialog,
	DialogContent,
	Divider,
	IconButton,
	Link,
	Paper,
	styled,
	Typography,
	useTheme,
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
	const theme = useTheme();
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
							background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.light} 100%)`,
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
								`linear-gradient(135deg, ${theme.palette.primary.dark}1A 0%, ${theme.palette.primary.main}0D 100%)`,
							border: `1px solid ${theme.palette.primary.dark}33`,
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

						<Link
							onClick={() => handleOpenLink("https://alvaromweb3.com/")}
							sx={{
								fontSize: "1.5rem",
								fontWeight: "bold",
								mb: 3,
								cursor: "pointer",
								display: "inline-block",
							}}
						>
							@N3koSempai
						</Link>

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

						{/* Contact Button */}
						<Button
							variant="contained"
							startIcon={<EmailIcon />}
							onClick={() => handleOpenLink("mailto:me@nekosempai.addy.io")}
							sx={{
								mt: 2,
								px: 4,
								py: 1.5,
								borderRadius: 2,
								background:
									`linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
								textTransform: "none",
								fontSize: "1rem",
								fontWeight: "bold",
								boxShadow: `0 4px 15px ${theme.palette.primary.dark}4D`,
								"&:hover": {
									background:
										`linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
									boxShadow: `0 6px 20px ${theme.palette.primary.dark}66`,
								},
							}}
						>
							{t("about.contactMe")}
						</Button>
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
							<Link
								onClick={() =>
									handleOpenLink(
										"https://github.com/N3koSempai/KliaStore/blob/master/LICENSE.md",
									)
								}
								sx={{ cursor: "pointer" }}
							>
								{t("about.viewLicense")}
							</Link>
						</Box>

						<Box sx={{ textAlign: "center" }}>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 1, fontWeight: "bold" }}
							>
								{t("about.contributing")}
							</Typography>
							<Link
								onClick={() =>
									handleOpenLink(
										"https://github.com/N3koSempai/KliaStore/blob/master/CONTRIBUTING.md",
									)
								}
								sx={{ cursor: "pointer" }}
							>
								{t("about.viewContributing")}
							</Link>
						</Box>
					</Box>
				</Box>
			</DialogContent>
		</Dialog>
	);
};
