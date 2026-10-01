import CloseIcon from "@mui/icons-material/Close";
import LanguageRounded from "@mui/icons-material/LanguageRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import {
	Box,
	Button,
	Dialog,
	DialogContent,
	Divider,
	IconButton,
	Link,
	Paper,
	Typography,
	useTheme,
} from "@mui/material";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import packageJson from "../../package.json";
import { CONTRIBUTORS } from "../data/contributors";

interface AboutModalProps {
	open: boolean;
	onClose: () => void;
}

const PROJECT_HOME_URL = "https://kliahub.xyz/";
const UPDATES_CHANNEL_URL = "https://t.me/klia_software";
const LICENSE_URL =
	"https://github.com/N3koSempai/KliaStore/blob/master/LICENSE.md";
const CONTRIBUTING_URL =
	"https://github.com/N3koSempai/KliaStore/blob/master/CONTRIBUTING.md";

export const AboutModal = ({ open, onClose }: AboutModalProps) => {
	const { t } = useTranslation();
	const theme = useTheme();

	const handleOpenLink = async (url: string) => {
		try {
			await openUrl(url);
		} catch (error) {
			console.error("Error opening link:", error);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
			<IconButton
				aria-label={t("common.close")}
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
					{/* Software name — first thing the eye should land on */}
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

					{/* Version — second focus of the dialog, right under the name */}
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							px: 2,
							py: 0.5,
							borderRadius: "999px",
							border: `1px solid ${theme.palette.primary.dark}66`,
							backgroundColor: `${theme.palette.primary.dark}1A`,
						}}
					>
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{ textTransform: "uppercase", letterSpacing: 1 }}
						>
							{t("about.version")}
						</Typography>
						<Typography
							variant="body1"
							sx={{ fontWeight: "bold", color: theme.palette.primary.light }}
						>
							{packageJson.version}
						</Typography>
					</Box>

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

					{/* Primary links: project home + updates channel */}
					<Box
						sx={{
							display: "flex",
							gap: 1.5,
							flexWrap: "wrap",
							justifyContent: "center",
							mt: 0.5,
						}}
					>
						<Button
							variant="contained"
							size="small"
							startIcon={<LanguageRounded sx={{ fontSize: 16 }} />}
							onClick={() => handleOpenLink(PROJECT_HOME_URL)}
							sx={{
								px: 2.5,
								borderRadius: 2,
								textTransform: "none",
								fontSize: "0.8125rem",
								fontWeight: 600,
								background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
								boxShadow: `0 2px 8px ${theme.palette.primary.dark}40`,
								"&:hover": {
									background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
									boxShadow: `0 3px 12px ${theme.palette.primary.dark}59`,
								},
							}}
						>
							{t("about.projectHome")}
						</Button>

						<Button
							variant="contained"
							size="small"
							startIcon={<SendRounded sx={{ fontSize: 16 }} />}
							onClick={() => handleOpenLink(UPDATES_CHANNEL_URL)}
							sx={{
								px: 2.5,
								borderRadius: 2,
								textTransform: "none",
								fontSize: "0.8125rem",
								fontWeight: 600,
								background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
								boxShadow: `0 2px 8px ${theme.palette.primary.dark}40`,
								"&:hover": {
									background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
									boxShadow: `0 3px 12px ${theme.palette.primary.dark}59`,
								},
							}}
						>
							{t("about.updatesChannel")}
						</Button>
					</Box>

					<Divider sx={{ width: "100%", my: 1 }} />

					{/* Secondary links */}
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
								onClick={() => handleOpenLink(LICENSE_URL)}
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
								onClick={() => handleOpenLink(CONTRIBUTING_URL)}
								sx={{ cursor: "pointer" }}
							>
								{t("about.viewContributing")}
							</Link>
						</Box>
					</Box>

					{/* Contributors — label sits outside the box, above it */}
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 0.75,
							width: "100%",
						}}
					>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{
								textTransform: "uppercase",
								letterSpacing: 1,
								fontWeight: "bold",
								textAlign: "center",
							}}
						>
							{t("about.contributors")} — {t("about.thanksTo")}
						</Typography>

						<Paper
							elevation={0}
							sx={{
								width: "50%",
								py: 1,
								px: 1.5,
								borderRadius: 2,
								backgroundColor: "rgba(0, 0, 0, 0.15)",
								border: "1px solid #21262d",
							}}
						>
							<Box
								sx={{
									display: "grid",
									gridTemplateColumns: "1fr auto",
									alignItems: "center",
									maxHeight: 132,
									overflowY: "auto",
									scrollbarWidth: "thin",
									"&::-webkit-scrollbar": { width: 6 },
									"&::-webkit-scrollbar-track": {
										backgroundColor: "transparent",
									},
									"&::-webkit-scrollbar-thumb": {
										backgroundColor: "#30363d",
										borderRadius: 3,
									},
									// separador de filas; la última no lo lleva
									"& > :nth-child(n+3):nth-last-child(n+3)": {
										borderBottom: "1px solid #21262d",
									},
								}}
							>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										pr: 2,
										pb: 0.5,
										borderBottom: "1px solid #21262d",
										fontSize: "0.625rem",
										textTransform: "uppercase",
										letterSpacing: 0.5,
									}}
								>
									{t("about.contributorUser")}
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										pl: 2,
										pb: 0.5,
										borderBottom: "1px solid #21262d",
										fontSize: "0.625rem",
										textTransform: "uppercase",
										letterSpacing: 0.5,
									}}
								>
									{t("about.contributorTopic")}
								</Typography>

								{CONTRIBUTORS.map((contributor) => (
									<Fragment key={contributor.user}>
										<Link
											onClick={() => handleOpenLink(contributor.url)}
											title={contributor.url}
											underline="hover"
											sx={{
												cursor: "pointer",
												minWidth: 0,
												py: 0.5,
												pr: 2,
												fontSize: "0.8125rem",
												lineHeight: 1.4,
												color: theme.palette.primary.light,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{contributor.user}
										</Link>
										<Typography
											variant="caption"
											title={t(contributor.topicKey)}
											sx={{
												pl: 2,
												py: 0.5,
												fontSize: "0.75rem",
												color: "text.secondary",
												whiteSpace: "nowrap",
											}}
										>
											{t(contributor.topicKey)}
										</Typography>
									</Fragment>
								))}
							</Box>
						</Paper>
					</Box>
				</Box>
			</DialogContent>
		</Dialog>
	);
};
