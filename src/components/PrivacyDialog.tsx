import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import {
	alpha,
	Box,
	Button,
	Collapse,
	Typography,
	useTheme,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { neutral, radius } from "../theme/tokens";
import type {
	AppPrivacyAssessment,
	FindingLevel,
	PrivacyFinding,
	PrivacyFocus,
} from "../utils/appPrivacy";
import { PRIVACY_FOCUS_ICONS, PRIVACY_LEVEL_COLORS } from "./PrivacyBadge";
import { AppDialog } from "./ui/AppDialog";

const FINDING_COLORS: Record<FindingLevel, string> = {
	info: neutral[500],
	caution: PRIVACY_LEVEL_COLORS.caution,
	high: PRIVACY_LEVEL_COLORS.high,
};

const FocusSection = ({ focus }: { focus: PrivacyFocus }) => {
	const { t } = useTranslation();
	const theme = useTheme();
	const [showTechnical, setShowTechnical] = useState(false);
	const Icon = PRIVACY_FOCUS_ICONS[focus.id];
	const color = PRIVACY_LEVEL_COLORS[focus.level];
	const raw = focus.findings.flatMap((f) => f.raw ?? []);

	const findingText = (finding: PrivacyFinding): string => {
		const params = { ...finding.params };
		if (typeof params.level === "string") {
			params.level = t(`privacy.rating.${params.level}`);
		}
		return t(`privacy.findings.${finding.id}`, params);
	};

	return (
		<Box
			sx={{
				border: `1px solid ${theme.tokens.border.subtle}`,
				borderRadius: `${radius.lg}px`,
				p: 2,
				background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, transparent 60%)`,
				opacity: focus.level === "unknown" ? 0.7 : 1,
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
				<Box
					sx={{
						color,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 40,
						height: 40,
						borderRadius: 2,
						flexShrink: 0,
						bgcolor: alpha(color, 0.16),
					}}
				>
					<Icon />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle1" fontWeight={700}>
						{t(`privacy.foci.${focus.id}`)}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{focus.level === "unknown"
							? t("privacy.summary.unknown")
							: t(`privacy.summary.${focus.id}.${focus.level}`)}
					</Typography>
				</Box>
				<Typography
					variant="caption"
					sx={{
						color,
						bgcolor: alpha(color, 0.16),
						borderRadius: "999px",
						px: 1.25,
						py: 0.35,
						fontWeight: 700,
						letterSpacing: 0.2,
						whiteSpace: "nowrap",
					}}
				>
					{t(`privacy.levels.${focus.level}`)}
				</Typography>
			</Box>

			{focus.level !== "unknown" && (
				<Box
					component="ul"
					sx={{
						m: 0,
						mt: 1.5,
						p: 0,
						pt: 1.5,
						listStyle: "none",
						borderTop: "1px solid rgba(255, 255, 255, 0.06)",
						"& > li:first-of-type": { mt: 1.25 },
					}}
				>
					{focus.findings.length === 0 && (
						<Typography variant="body2" color="text.secondary">
							{t("privacy.noFindings")}
						</Typography>
					)}
					{focus.findings.map((finding) => (
						<Box
							component="li"
							key={finding.id}
							sx={{ display: "flex", gap: 1, alignItems: "baseline", py: 0.4 }}
						>
							<Box
								sx={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									flexShrink: 0,
									bgcolor: FINDING_COLORS[finding.level],
								}}
							/>
							<Typography variant="body2">{findingText(finding)}</Typography>
						</Box>
					))}
				</Box>
			)}

			{raw.length > 0 && (
				<>
					<Button
						size="small"
						onClick={() => setShowTechnical((v) => !v)}
						endIcon={
							<ExpandMoreRounded
								sx={{
									transform: showTechnical ? "rotate(180deg)" : "none",
									transition: "transform 0.2s",
								}}
							/>
						}
						color="neutral"
						sx={{ mt: 1, ml: -1 }}
					>
						{t("privacy.technical")}
					</Button>
					<Collapse in={showTechnical}>
						<Box
							sx={{
								mt: 0.5,
								p: 1,
								borderRadius: 1,
								bgcolor: "rgba(0, 0, 0, 0.25)",
								border: "1px solid rgba(255, 255, 255, 0.05)",
								fontFamily: "JetBrains Mono, monospace",
								fontSize: "0.75rem",
								color: "text.secondary",
								wordBreak: "break-all",
							}}
						>
							{raw.map((line) => (
								<div key={line}>{line}</div>
							))}
						</Box>
					</Collapse>
				</>
			)}
		</Box>
	);
};

interface PrivacyDialogProps {
	open: boolean;
	onClose: () => void;
	appName: string;
	assessment: AppPrivacyAssessment;
}

export const PrivacyDialog = ({
	open,
	onClose,
	appName,
	assessment,
}: PrivacyDialogProps) => {
	const { t } = useTranslation();

	return (
		<AppDialog
			open={open}
			onClose={onClose}
			scroll="paper"
			dividers
			title={t("privacy.title")}
			subtitle={appName}
			actions={
				<Button variant="outlined" color="neutral" onClick={onClose}>
					{t("privacy.close")}
				</Button>
			}
		>
			<Typography variant="body2" color="text.secondary">
				{t("privacy.intro")}
			</Typography>
			{assessment.foci.map((focus) => (
				<FocusSection key={focus.id} focus={focus} />
			))}
			<Typography variant="caption" color="text.secondary">
				{t("privacy.disclaimer")}
			</Typography>
		</AppDialog>
	);
};
