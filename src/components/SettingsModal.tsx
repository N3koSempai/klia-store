import CloseIcon from "@mui/icons-material/Close";
import ContrastIcon from "@mui/icons-material/Contrast";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import {
	Box,
	Dialog,
	DialogContent,
	Divider,
	IconButton,
	MenuItem,
	Select,
	Switch,
	Typography,
	useTheme,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
	type ColorBlindMode,
	useAccessibilityStore,
} from "../store/accessibilityStore";

interface SettingsModalProps {
	open: boolean;
	onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
	const { t } = useTranslation();
	const theme = useTheme();
	const {
		colorBlindMode,
		reducedMotion,
		highContrast,
		setColorBlindMode,
		setReducedMotion,
		setHighContrast,
	} = useAccessibilityStore();

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
				{/* Header */}
				<Typography
					variant="h5"
					component="h2"
					sx={{
						fontWeight: 700,
						mb: 0.5,
						background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.info.main} 100%)`,
						WebkitBackgroundClip: "text",
						WebkitTextFillColor: "transparent",
					}}
				>
					{t("settings.title")}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
					{t("settings.subtitle")}
				</Typography>

				<Divider sx={{ mb: 3 }} />

				{/* Accessibility section */}
				<Typography
					variant="caption"
					sx={{
						textTransform: "uppercase",
						letterSpacing: "0.08em",
						fontWeight: 700,
						color: "text.secondary",
						display: "block",
						mb: 2,
					}}
				>
					{t("settings.accessibilitySection")}
				</Typography>

				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					{/* Reduced motion */}
					<SettingsRow
						icon={<VisibilityOffOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}
						label={t("welcome.accessibility.reducedMotion")}
						description={t("welcome.accessibility.reducedMotionDesc")}
					>
						<Switch
							checked={reducedMotion}
							onChange={(e) => setReducedMotion(e.target.checked)}
							color="primary"
							inputProps={{ "aria-label": t("welcome.accessibility.reducedMotion") }}
						/>
					</SettingsRow>

					<Divider sx={{ opacity: 0.4 }} />

					{/* High contrast */}
					<SettingsRow
						icon={<ContrastIcon sx={{ fontSize: 20, color: "text.secondary" }} />}
						label={t("welcome.accessibility.highContrast")}
						description={t("welcome.accessibility.highContrastDesc")}
					>
						<Switch
							checked={highContrast}
							onChange={(e) => setHighContrast(e.target.checked)}
							color="primary"
							inputProps={{ "aria-label": t("welcome.accessibility.highContrast") }}
						/>
					</SettingsRow>

					<Divider sx={{ opacity: 0.4 }} />

					{/* Color blind mode */}
					<SettingsRow
						icon={<PaletteOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}
						label={t("welcome.accessibility.colorBlind")}
						description={t("welcome.accessibility.colorBlindDesc")}
					>
						<Select
							value={colorBlindMode}
							onChange={(e) => setColorBlindMode(e.target.value as ColorBlindMode)}
							size="small"
							inputProps={{ "aria-label": t("welcome.accessibility.colorBlind") }}
							sx={{
								minWidth: 190,
								fontSize: "0.85rem",
								"& .MuiOutlinedInput-notchedOutline": {
									borderColor: "rgba(255,255,255,0.15)",
								},
								"&:hover .MuiOutlinedInput-notchedOutline": {
									borderColor: "primary.main",
								},
							}}
						>
							<MenuItem value="none">{t("welcome.accessibility.colorBlindNone")}</MenuItem>
							<MenuItem value="deuteranopia">{t("welcome.accessibility.colorBlindDeuteranopia")}</MenuItem>
							<MenuItem value="protanopia">{t("welcome.accessibility.colorBlindProtanopia")}</MenuItem>
							<MenuItem value="tritanopia">{t("welcome.accessibility.colorBlindTritanopia")}</MenuItem>
						</Select>
					</SettingsRow>
				</Box>
			</DialogContent>
		</Dialog>
	);
};

// Row layout reutilizable
interface SettingsRowProps {
	icon: React.ReactNode;
	label: string;
	description: string;
	children: React.ReactNode;
}

const SettingsRow = ({ icon, label, description, children }: SettingsRowProps) => (
	<Box
		sx={{
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 2,
			py: 1,
		}}
	>
		<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flex: 1 }}>
			<Box sx={{ mt: 0.3 }}>{icon}</Box>
			<Box>
				<Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
					{label}
				</Typography>
				<Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
					{description}
				</Typography>
			</Box>
		</Box>
		{children}
	</Box>
);
