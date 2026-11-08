import type { SvgIconComponent } from "@mui/icons-material";
import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import MemoryRounded from "@mui/icons-material/MemoryRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import PeopleAltRounded from "@mui/icons-material/PeopleAltRounded";
import { Box, ButtonBase, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { lines, neutral, status } from "../theme/tokens";
import type {
	AppPrivacyAssessment,
	PrivacyFocusId,
	PrivacyLevel,
} from "../utils/appPrivacy";

export const PRIVACY_FOCUS_ICONS: Record<PrivacyFocusId, SvgIconComponent> = {
	storage: FolderOpenRounded,
	system: MemoryRounded,
	social: PeopleAltRounded,
	money: PaymentsRounded,
};

export const PRIVACY_LEVEL_COLORS: Record<PrivacyLevel, string> = {
	safe: status.success,
	caution: status.warning,
	high: status.danger,
	unknown: neutral[500],
};

// El color nunca es la única señal: el relleno y el borde crecen con el nivel
// y cada foco tiene tooltip con texto.
const cellStyle = (level: PrivacyLevel) => {
	const color = PRIVACY_LEVEL_COLORS[level];
	const tint = level === "high" ? "33" : level === "caution" ? "1f" : "00";
	return {
		color,
		bgcolor: `${color}${tint}`,
		boxShadow: level === "high" ? `inset 0 0 0 1px ${color}` : "none",
		opacity: level === "unknown" ? 0.55 : 1,
	};
};

interface PrivacyBadgeProps {
	assessment: AppPrivacyAssessment;
	onOpen: () => void;
}

export const PrivacyBadge = ({ assessment, onOpen }: PrivacyBadgeProps) => {
	const { t } = useTranslation();

	return (
		<ButtonBase
			onClick={onOpen}
			aria-label={t("privacy.badgeLabel")}
			sx={{
				display: "inline-flex",
				alignItems: "stretch",
				bgcolor: lines.subtle,
				border: `1px solid ${lines.default}`,
				borderRadius: "6px",
				overflow: "hidden",
				transition: "border-color 0.2s",
				"&:hover": { borderColor: "primary.main" },
			}}
		>
			{assessment.foci.map((focus, index) => {
				const Icon = PRIVACY_FOCUS_ICONS[focus.id];
				const summary =
					focus.level === "unknown"
						? t("privacy.summary.unknown")
						: t(`privacy.summary.${focus.id}.${focus.level}`);
				return (
					<Tooltip
						key={focus.id}
						arrow
						title={`${t(`privacy.foci.${focus.id}`)} · ${t(`privacy.levels.${focus.level}`)}: ${summary}`}
					>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								px: 1.25,
								py: 0.5,
								borderLeft: index === 0 ? "none" : `1px solid ${lines.default}`,
								transition: "background-color 0.2s",
								...cellStyle(focus.level),
							}}
						>
							<Icon fontSize="small" />
						</Box>
					</Tooltip>
				);
			})}
		</ButtonBase>
	);
};
