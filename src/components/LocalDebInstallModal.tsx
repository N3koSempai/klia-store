import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import SecurityIcon from "@mui/icons-material/Security";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Collapse,
	Dialog,
	DialogContent,
	Divider,
	LinearProgress,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	Fragment,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import errorAnim from "../assets/animations/Error.lottie";
import successAnim from "../assets/animations/success.lottie";
import { appendPtyLine, stripAnsi } from "../pages/appDetails/utils/ptyOutput";
import { refreshInstalledPackages } from "../services/installedPackages";
import { brand, hues, lines, neutral, status } from "../theme/tokens";
import { LazyLottie } from "./LazyLottie";
import { Terminal } from "./Terminal";

// Mirrors `DebLocalInfo` in src-tauri/src/local_deb.rs (snake_case over IPC).
interface DebScript {
	name: string;
	bytes: number;
	content: string;
}

interface DebSystemPath {
	path: string;
	category: string;
}

interface DebDirCount {
	path: string;
	files: number;
}

interface DebLocalInfo {
	package: string;
	version: string;
	architecture: string;
	host_architecture: string;
	maintainer: string | null;
	homepage: string | null;
	section: string | null;
	priority: string | null;
	source: string | null;
	description: string | null;
	essential: boolean;
	multi_arch: string | null;
	file_path: string;
	file_size_bytes: number;
	installed_size_kb: number;
	data_bytes: number;
	file_count: number;
	sha256: string;
	depends: string[];
	pre_depends: string[];
	recommends: string[];
	suggests: string[];
	conflicts: string[];
	breaks: string[];
	replaces: string[];
	provides: string[];
	in_configured_repo: boolean;
	repo_version: string | null;
	signed: boolean;
	signature_members: string[];
	already_installed: boolean;
	installed_version: string | null;
	maintainer_scripts: DebScript[];
	setuid_files: string[];
	setgid_files: string[];
	system_paths: DebSystemPath[];
	dir_summary: DebDirCount[];
	conffiles: string[];
	raw_control: string;
}

// Mirrors `DebDependencyCheck` in src-tauri/src/local_deb.rs. Only produced by
// the authorized check (`pkexec`), which refreshes the package lists first.
interface DebDependencyCheck {
	plan_new: string[];
	plan_upgrade: string[];
	plan_remove: string[];
	plan_kept: number;
	ok: boolean;
	error: string | null;
	/** Requirements apt cannot satisfy with the configured repositories. */
	unmet: string[];
	update_raw: string;
	simulation_raw: string;
	/** True when it ran as root (package lists refreshed). */
	privileged: boolean;
	/** Caveat shown when the answer is degraded. */
	notice: string | null;
}

type Level = "ok" | "info" | "warn" | "risk";

interface Insight {
	key: string;
	title: string;
	detail: string;
	level: Level;
	/** Individual paths / package names behind the summary. */
	items?: string[];
	/** Raw source the user can expand (scripts, apt output, …). */
	raw?: string;
	rawLabel?: string;
}

interface Assessment {
	blockers: string[];
	insights: Insight[];
	level: Level;
}

// Operations that make an install-time script worth a second look. These are
// heuristics for the reviewer, not a malware verdict: the raw script is always
// one click away.
const SCRIPT_PATTERNS: { re: RegExp; label: string }[] = [
	{
		re: /\b(curl|wget)\b[^\n]*\|\s*(ba)?sh\b/,
		label: "Pipes a download into a shell",
	},
	{ re: /\bbase64\s+(?:-d|--decode)\b/, label: "Decodes base64 payloads" },
	{ re: /\beval\b/, label: "Evaluates dynamically built strings" },
	{
		re: /\b(useradd|adduser|usermod|chpasswd|passwd)\b/,
		label: "Creates or modifies accounts",
	},
	{
		re: /\bchmod\s+(?:[0-7]?[4-7][0-7]{2}|u\+s)\b/,
		label: "Sets setuid permissions",
	},
	{ re: /\bsetcap\b/, label: "Grants kernel capabilities" },
	{
		re: /\bsystemctl\s+(?:enable|start|restart|daemon-reload)\b/,
		label: "Enables or starts system services",
	},
	{ re: /\b(insmod|modprobe)\b/, label: "Loads kernel modules" },
	{ re: /\bdd\s+of=\/dev\//, label: "Writes raw data to a device" },
	{ re: /\brm\s+-rf\s+\/(?!tmp)/, label: "Recursive delete outside /tmp" },
	{ re: /\.ssh\/|authorized_keys/, label: "Touches SSH keys" },
	{ re: /\bcrontab\b|\/etc\/cron/, label: "Installs scheduled jobs" },
	{
		re: /\b(apt|apt-get|dpkg)\s+(install|remove|-i)\b/,
		label: "Installs or removes other packages",
	},
	{ re: /\/dev\/tcp\//, label: "Opens a raw network socket" },
	{ re: /\biptables\b|\bnft\b/, label: "Modifies firewall rules" },
];

const CATEGORY_LABELS: Record<string, string> = {
	service: "system service",
	cron: "scheduled job",
	autostart: "autostart entry",
	"shell-init": "shell init hook",
	loader: "dynamic loader config",
	sudoers: "sudoers rule",
	privilege: "privilege policy (polkit/dbus)",
	udev: "udev rule",
	kernel: "kernel module config",
	auth: "authentication config",
	apt: "APT config",
	config: "system config",
	vendor: "vendor payload",
};

const PRIVILEGED_CATEGORIES = new Set([
	"service",
	"cron",
	"autostart",
	"sudoers",
	"privilege",
	"udev",
	"kernel",
	"auth",
	"loader",
	"shell-init",
	"apt",
]);

const levelColor: Record<Level, string> = {
	ok: hues.greenMaterial,
	info: status.info,
	warn: brand.secondary,
	risk: hues.orangeDeep,
};

const verdictColor: Record<"ok" | "warn" | "risk" | "block", string> = {
	ok: hues.greenMaterial,
	warn: brand.secondary,
	risk: hues.orangeDeep,
	block: hues.red,
};

const verdictLabel: Record<"ok" | "warn" | "risk" | "block", string> = {
	ok: "Looks standard",
	warn: "Review recommended",
	risk: "High risk",
	block: "Cannot install",
};

function formatBytes(bytes: number): string {
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
	return `${bytes} B`;
}

/** Very small, non-semver version comparison: enough to label reinstall vs. downgrade. */
function compareVersions(a: string, b: string): number {
	const norm = (v: string) =>
		v
			.replace(/[~+-].*$/, "")
			.split(/[.:]/)
			.map((p) => Number.parseInt(p, 10) || 0);
	const left = norm(a);
	const right = norm(b);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left[i] ?? 0;
		const r = right[i] ?? 0;
		if (l !== r) return l > r ? 1 : -1;
	}
	return 0;
}

function assess(info: DebLocalInfo): Assessment {
	const blockers: string[] = [];
	const insights: Insight[] = [];

	if (
		info.architecture !== "all" &&
		info.host_architecture &&
		info.architecture !== info.host_architecture
	) {
		blockers.push(
			`This package is built for ${info.architecture}, but this system is ${info.host_architecture}.`,
		);
	}
	if (info.essential) {
		blockers.push(
			"This is an essential system package and cannot be installed this way.",
		);
	}
	if (info.section === "metapackages") {
		blockers.push(
			"This is a system metapackage (Section=metapackages): installing or replacing it could drag the desktop with it.",
		);
	}

	// Installer scripts: the strongest signal of what runs as root.
	if (info.maintainer_scripts.length > 0) {
		const flags: string[] = [];
		for (const script of info.maintainer_scripts) {
			for (const { re, label } of SCRIPT_PATTERNS) {
				if (
					re.test(script.content) &&
					!flags.includes(`${label} (${script.name})`)
				) {
					flags.push(`${label} (${script.name})`);
				}
			}
		}
		insights.push({
			key: "scripts",
			title: `${info.maintainer_scripts.length} installer script${
				info.maintainer_scripts.length !== 1 ? "s" : ""
			} run as root`,
			detail:
				flags.length > 0
					? "They perform operations that change the system beyond copying files."
					: "They run with root privileges during install, upgrade and removal.",
			level: flags.length > 0 ? "risk" : "warn",
			items: flags,
			raw: info.maintainer_scripts
				.map((s) => `# ${s.name} (${s.bytes} bytes)\n${s.content}`)
				.join("\n\n"),
			rawLabel: "Show installer scripts",
		});
	}

	// System hooks: services, cron, polkit, udev, auth config…
	if (info.system_paths.length > 0) {
		const byCategory = new Map<string, string[]>();
		for (const p of info.system_paths) {
			const list = byCategory.get(p.category) ?? [];
			list.push(p.path);
			byCategory.set(p.category, list);
		}
		const summary = [...byCategory.entries()]
			.map(([cat, list]) => `${list.length} × ${CATEGORY_LABELS[cat] ?? cat}`)
			.join(" · ");
		insights.push({
			key: "system",
			title: `${info.system_paths.length} system hook${
				info.system_paths.length !== 1 ? "s" : ""
			}`,
			detail: summary,
			level: [...byCategory.keys()].some((c) => PRIVILEGED_CATEGORIES.has(c))
				? "risk"
				: "warn",
			items: info.system_paths
				.slice(0, 60)
				.map((p) => `[${CATEGORY_LABELS[p.category] ?? p.category}] ${p.path}`),
			rawLabel: "Show file paths",
		});
	}

	if (info.setuid_files.length > 0) {
		insights.push({
			key: "setuid",
			title: `${info.setuid_files.length} setuid binar${
				info.setuid_files.length !== 1 ? "ies" : "y"
			}`,
			detail:
				"Run with the privileges of the file owner (root) no matter who launches them.",
			level: "risk",
			items: info.setuid_files,
			rawLabel: "Show paths",
		});
	}

	if (info.setgid_files.length > 0) {
		insights.push({
			key: "setgid",
			title: `${info.setgid_files.length} setgid binar${
				info.setgid_files.length !== 1 ? "ies" : "y"
			}`,
			detail: "Run with the privileges of a privileged group.",
			level: "warn",
			items: info.setgid_files,
			rawLabel: "Show paths",
		});
	}

	// Payload footprint, always shown: it is the "what will land on disk" answer.
	const dirs = info.dir_summary
		.slice(0, 6)
		.map((d) => `${d.path} (${d.files})`)
		.join(" · ");
	insights.push({
		key: "payload",
		title: `${info.file_count} file${info.file_count !== 1 ? "s" : ""}, ${formatBytes(
			info.data_bytes,
		)} on disk`,
		detail: dirs || "No file entries were reported.",
		level: "info",
	});

	if (info.conffiles.length > 0) {
		insights.push({
			key: "conffiles",
			title: `${info.conffiles.length} configuration file${
				info.conffiles.length !== 1 ? "s" : ""
			}`,
			detail:
				"Owned by the package; preserved as-is on upgrades unless you change them.",
			level: "info",
			items: info.conffiles,
			rawLabel: "Show paths",
		});
	}

	if (info.pre_depends.length > 0) {
		insights.push({
			key: "predep",
			title: "Requires packages before unpacking",
			detail:
				"Pre-Depends must already be configured; the install aborts otherwise.",
			level: "warn",
			items: info.pre_depends,
		});
	}

	const relational = [
		...info.conflicts.map((p) => `Conflicts: ${p}`),
		...info.breaks.map((p) => `Breaks: ${p}`),
		...info.replaces.map((p) => `Replaces: ${p}`),
	];
	if (relational.length > 0) {
		insights.push({
			key: "relational",
			title: "Changes other installed packages",
			detail:
				"Installing this package will conflict with, break or replace packages already on the system.",
			level: "warn",
			items: relational,
		});
	}

	// Provenance
	if (info.in_configured_repo) {
		const sameVersion = info.repo_version === info.version;
		insights.push({
			key: "provenance",
			title: sameVersion
				? "Published in your configured repositories"
				: `Repository publishes ${info.repo_version}`,
			detail: sameVersion
				? "The version matches the repository entry, but a local file is never authenticated by APT."
				: "The file differs from the version your repositories publish. It may be a different build.",
			level: sameVersion ? "ok" : "warn",
		});
	} else {
		insights.push({
			key: "provenance",
			title: "Not in any configured repository",
			detail:
				"This package cannot be checked against a trusted repository. It is most likely a third-party build.",
			level: "warn",
		});
	}

	if (!info.signed) {
		insights.push({
			key: "signature",
			title: "No embedded signature",
			detail:
				"dpkg does not authenticate standalone .deb files. The download is only as trustworthy as its source.",
			level: "info",
		});
	} else {
		insights.push({
			key: "signature",
			title: "Signed package",
			detail: `Embedded signature: ${info.signature_members.join(", ")}.`,
			level: "ok",
		});
	}

	if (info.already_installed) {
		const cmp =
			info.installed_version && info.version
				? compareVersions(info.version, info.installed_version)
				: 0;
		insights.push({
			key: "installed",
			title:
				cmp < 0
					? `Downgrades ${info.installed_version} → ${info.version}`
					: cmp > 0
						? `Upgrades ${info.installed_version} → ${info.version}`
						: "Reinstalls the same version",
			detail:
				cmp < 0
					? "Downgrades need an extra confirmation and may leave files from the newer version behind."
					: "The package is already installed on this system.",
			level: cmp < 0 ? "warn" : "info",
		});
	}

	// The resolved dependency plan is deliberately not computed here: it needs
	// fresh package lists, therefore root, so the user triggers it explicitly
	// with the "Check dependencies" button (see `check_local_deb_dependencies`).

	const level: Level = insights.some((i) => i.level === "risk")
		? "risk"
		: insights.some((i) => i.level === "warn")
			? "warn"
			: "ok";

	return { blockers, insights, level };
}

function verdictOf(assessment: Assessment): "ok" | "warn" | "risk" | "block" {
	if (assessment.blockers.length > 0) return "block";
	return assessment.level === "risk"
		? "risk"
		: assessment.level === "warn"
			? "warn"
			: "ok";
}

function SectionTitle({
	icon,
	title,
	right,
}: {
	icon: ReactNode;
	title: string;
	right?: ReactNode;
}) {
	return (
		<Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
			{/* Clarification icon: it reinforces the title, so it stays at ~70% of the
			    title's visual weight instead of competing with it (book: "Icons →
			    Utilizing Icons Effectively", and the sidebar guideline on icon
			    opacity). */}
			<Box
				sx={{
					color: brand.primary,
					opacity: 0.7,
					display: "flex",
					fontSize: "1rem",
				}}
			>
				{icon}
			</Box>
			<Typography
				sx={{
					fontFamily: "IBM Plex Sans, sans-serif",
					fontWeight: 700,
					fontSize: "0.875rem",
					color: neutral[1000],
					flex: 1,
				}}
			>
				{title}
			</Typography>
			{right}
		</Stack>
	);
}

// The modal is a three-stage wizard (review → install → done), so it shows the
// progress instead of leaving the user to guess where they are. Book, "Wizards →
// Designing an Effective Wizard": indicate progress by numbering the steps, and
// keep the labels short.
const PHASE_STEPS = ["Review", "Install", "Done"] as const;

function StepIndicator({ phase }: { phase: Phase }) {
	const activeIndex = phase === "done" ? 2 : phase === "review" ? 0 : 1;
	return (
		<Stack
			direction="row"
			alignItems="center"
			sx={{ px: 3, py: 2, borderBottom: `1px solid ${lines.subtle}` }}
		>
			{PHASE_STEPS.map((label, index) => {
				const done = index < activeIndex;
				const active = index === activeIndex;
				const color = done
					? hues.greenMaterial
					: active
						? brand.primary
						: "rgba(255,255,255,0.3)";
				return (
					<Fragment key={label}>
						<Stack direction="row" spacing={1} alignItems="center">
							<Box
								sx={{
									width: 20,
									height: 20,
									borderRadius: "50%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									border: `1px solid ${color}`,
									color,
									fontSize: "0.6875rem",
									fontWeight: 700,
								}}
							>
								{done ? "✓" : index + 1}
							</Box>
							<Typography
								sx={{
									fontSize: "0.75rem",
									color: active ? neutral[1000] : "rgba(255,255,255,0.45)",
									fontWeight: active ? 600 : 400,
								}}
							>
								{label}
							</Typography>
						</Stack>
						{index < PHASE_STEPS.length - 1 && (
							<Box
								sx={{
									flex: 1,
									height: "1px",
									backgroundColor: lines.subtle,
									mx: 2,
								}}
							/>
						)}
					</Fragment>
				);
			})}
		</Stack>
	);
}

// Final state of the flow. Same shape as the install screen in AppDetails: the
// animation is the indicator, one line says what happened, one line says what it
// means, and the console is folded away behind a "Logs" button instead of
// owning the screen. The book's "Cards → Designing Cards" puts the critical
// content first and keeps the rest out of the way; its "Buttons → Button
// Placement" keeps the advancing action on the right.
function FeedbackScreen({
	outcome,
	title,
	detail,
	logs,
	actionLabel,
	onAction,
}: {
	outcome: "success" | "failure";
	title: string;
	detail: string;
	logs: string[];
	actionLabel: string;
	onAction: () => void;
}) {
	const [showLogs, setShowLogs] = useState(false);
	const accent = outcome === "success" ? hues.greenMaterial : hues.red;
	return (
		<Box
			sx={{
				px: 3,
				py: 4,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
			}}
		>
			<Box sx={{ width: 200, height: 200 }}>
				<LazyLottie
					key={outcome}
					src={outcome === "success" ? successAnim : errorAnim}
					loop={false}
					autoplay={true}
				/>
			</Box>

			<Typography
				sx={{
					fontFamily: "IBM Plex Sans, sans-serif",
					fontWeight: 600,
					fontSize: "1.25rem",
					color: accent,
					textAlign: "center",
					mt: 1,
				}}
			>
				{title}
			</Typography>

			<Typography
				sx={{
					fontSize: "0.8125rem",
					color: "rgba(255,255,255,0.55)",
					textAlign: "center",
					lineHeight: 1.6,
					mt: 1,
					maxWidth: 460,
				}}
			>
				{detail}
			</Typography>

			<Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
				{logs.length > 0 && (
					<Button
						variant="outlined"
						color="neutral"
						onClick={() => setShowLogs((v) => !v)}
						endIcon={
							showLogs ? (
								<ExpandLessIcon sx={{ fontSize: "1rem" }} />
							) : (
								<ExpandMoreIcon sx={{ fontSize: "1rem" }} />
							)
						}
						sx={{ minHeight: 36 }}
					>
						Logs
					</Button>
				)}
				<Button
					variant="contained"
					color={outcome === "success" ? "success" : "neutral"}
					onClick={onAction}
					sx={{ minHeight: 36 }}
				>
					{actionLabel}
				</Button>
			</Stack>

			{logs.length > 0 && (
				<Collapse in={showLogs} sx={{ width: "100%" }}>
					<Box
						sx={{
							mt: 2,
							borderRadius: 1.5,
							overflow: "hidden",
							border: "1px solid rgba(255,255,255,0.08)",
						}}
					>
						<Terminal output={logs} isRunning={false} />
					</Box>
				</Collapse>
			)}
		</Box>
	);
}

// Raw output surface. Deliberately not pure black on dark: the book's
// "Colors → Why Pure Black Isn't Ideal" warns about halation, and its dark-mode
// rule is to use a lighter tint of the background instead of a black hole. The
// inset shadow marks it as a scrollable content region rather than a control
// ("Shadows → Inner Shadow").
function CodeBlock({ text }: { text: string }) {
	return (
		<Box
			component="pre"
			sx={{
				maxHeight: 260,
				overflow: "auto",
				p: 2,
				borderRadius: 1.5,
				backgroundColor: "rgba(255,255,255,0.03)",
				border: `1px solid ${lines.subtle}`,
				boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
				fontFamily: "JetBrains Mono, monospace",
				fontSize: "0.6875rem",
				// Small text takes a taller line height (book: "Typography →
				// Line Height and Line Length": ~1.6 for small sizes).
				lineHeight: 1.6,
				color: "rgba(255,255,255,0.75)",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
				m: 0,
				mt: 1.5,
			}}
		>
			{text}
		</Box>
	);
}

function InsightRow({ insight }: { insight: Insight }) {
	const [open, setOpen] = useState(false);
	const expandable = Boolean(
		insight.raw || (insight.items && insight.items.length > 0),
	);
	const color = levelColor[insight.level];

	return (
		<Box
			sx={{
				px: 2,
				py: 1,
				borderRadius: 1.5,
				backgroundColor: `${color}0d`,
				border: `1px solid ${color}25`,
			}}
		>
			<Stack direction="row" spacing={1.25} alignItems="flex-start">
				<Box
					sx={{
						width: 7,
						height: 7,
						borderRadius: "50%",
						backgroundColor: color,
						flexShrink: 0,
						mt: "6px",
					}}
				/>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography
						sx={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.88)" }}
					>
						{insight.title}
					</Typography>
					<Typography
						sx={{
							fontSize: "0.75rem",
							color: "rgba(255,255,255,0.5)",
							mt: 0.5,
							lineHeight: 1.6,
						}}
					>
						{insight.detail}
					</Typography>
				</Box>
				{expandable && (
					<Button
						onClick={() => setOpen((v) => !v)}
						size="small"
						color="neutral"
						// A real chevron instead of a text arrow: the book's FAQ section
						// calls icons out as the signal that an area is expandable, and
						// mixing glyph arrows with the icon set breaks consistency.
						endIcon={
							open ? (
								<ExpandLessIcon sx={{ fontSize: "1rem" }} />
							) : (
								<ExpandMoreIcon sx={{ fontSize: "1rem" }} />
							)
						}
						sx={{
							minWidth: 0,
							fontSize: "0.6875rem",
							px: 1,
							flexShrink: 0,
							// Material recommends 36px touch targets; the text-only
							// version was ~22px tall.
							minHeight: 36,
						}}
					>
						{open ? "Hide" : (insight.rawLabel ?? "Details")}
					</Button>
				)}
			</Stack>
			{expandable && (
				<Collapse in={open}>
					{insight.items && insight.items.length > 0 && (
						<Stack spacing={0.4} sx={{ mt: 1 }}>
							{insight.items.map((item) => (
								<Typography
									key={item}
									sx={{
										fontFamily: "JetBrains Mono, monospace",
										fontSize: "0.6875rem",
										color: "rgba(255,255,255,0.55)",
										wordBreak: "break-all",
									}}
								>
									{item}
								</Typography>
							))}
						</Stack>
					)}
					{insight.raw && <CodeBlock text={insight.raw} />}
				</Collapse>
			)}
		</Box>
	);
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
	if (values.length === 0) return null;
	return (
		<Box sx={{ mb: 1 }}>
			<Typography
				sx={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.4)", mb: 0.5 }}
			>
				{label}
			</Typography>
			<Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
				{values.map((v) => (
					<Chip
						key={v}
						label={v}
						size="small"
						sx={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: "0.6875rem",
							height: 22,
							backgroundColor: lines.subtle,
							color: "rgba(255,255,255,0.6)",
							border: `1px solid ${lines.default}`,
						}}
					/>
				))}
			</Stack>
		</Box>
	);
}

interface LocalDebInstallModalProps {
	filePath: string | null;
	onClose: () => void;
}

type Phase = "loading" | "review" | "installing" | "done" | "error";

export function LocalDebInstallModal({
	filePath,
	onClose,
}: LocalDebInstallModalProps) {
	const [phase, setPhase] = useState<Phase>("loading");
	const [info, setInfo] = useState<DebLocalInfo | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [installError, setInstallError] = useState<string | null>(null);
	const [terminalLines, setTerminalLines] = useState<string[]>([]);
	const [showTerminal, setShowTerminal] = useState(false);
	const [showRawControl, setShowRawControl] = useState(false);
	const [allowDowngrade, setAllowDowngrade] = useState(false);
	const [depCheck, setDepCheck] = useState<DebDependencyCheck | null>(null);
	const [checkingDeps, setCheckingDeps] = useState(false);
	const [depCheckError, setDepCheckError] = useState<string | null>(null);
	const processKey = useRef<string | null>(null);

	const open = filePath !== null;
	const assessment = useMemo(() => (info ? assess(info) : null), [info]);
	// A failed resolution (unmet requirements) is as blocking as an essential
	// package: the install would abort inside apt.
	const depsUnresolved = depCheck !== null && !depCheck.ok;
	const verdict = depsUnresolved
		? "block"
		: assessment
			? verdictOf(assessment)
			: "ok";
	const blocked =
		(assessment ? assessment.blockers.length > 0 : false) || depsUnresolved;
	const needsDowngrade =
		info?.already_installed &&
		info.installed_version &&
		compareVersions(info.version, info.installed_version) < 0;

	// Load info when file changes
	useEffect(() => {
		if (!filePath) return;
		setPhase("loading");
		setInfo(null);
		setLoadError(null);
		setInstallError(null);
		setTerminalLines([]);
		setAllowDowngrade(false);
		setShowTerminal(false);
		setDepCheck(null);
		setDepCheckError(null);
		setCheckingDeps(false);

		invoke<DebLocalInfo>("inspect_local_deb", { filePath })
			.then((result) => {
				setInfo(result);
				setPhase("review");
			})
			.catch((err) => {
				setLoadError(String(err));
				setPhase("error");
			});
	}, [filePath]);

	const handleInstall = useCallback(async () => {
		if (!filePath) return;
		setPhase("installing");
		setInstallError(null);
		setTerminalLines([]);
		setShowTerminal(true);
		processKey.current = `localdeb::${filePath}`;

		const unlisteners: UnlistenFn[] = [];

		const unlistenOutput = await listen<[string, string]>(
			"pty-output",
			(event) => {
				const [key, line] = event.payload;
				if (key === processKey.current) {
					setTerminalLines((prev) => appendPtyLine(prev, line));
				}
			},
		);
		unlisteners.push(unlistenOutput);

		const unlistenError = await listen<[string, string]>(
			"pty-error",
			(event) => {
				const [key, line] = event.payload;
				if (key === processKey.current) {
					setTerminalLines((prev) => [...prev, `[stderr] ${stripAnsi(line)}`]);
				}
			},
		);
		unlisteners.push(unlistenError);

		const unlistenExit = await listen<[string, number]>("pty-exit", (event) => {
			const [key, code] = event.payload;
			if (key !== processKey.current) return;
			for (const fn of unlisteners) fn();
			if (code === 0) {
				setPhase("done");
				// Reconcile the store with the system so MyApps/AppDetails reflect
				// this install even though it bypassed the Flathub install flow.
				refreshInstalledPackages();
			} else {
				setInstallError(`Installation failed (exit code ${code}).`);
				setPhase("error");
			}
		});
		unlisteners.push(unlistenExit);

		try {
			await invoke("install_local_deb", { filePath, allowDowngrade });
		} catch (err) {
			setTerminalLines((prev) => [...prev, `Error: ${err}`]);
			setInstallError(String(err));
			setPhase("error");
			for (const fn of unlisteners) fn();
		}
	}, [filePath, allowDowngrade]);

	// Runs the check as root: polkit's own dialog asks for the password (its
	// agent lives on the session bus, so it also works from inside the Flatpak),
	// klia-store never sees or stores it, and the plan comes back parsed.
	const handleDependencyCheck = useCallback(async () => {
		if (!filePath) return;
		setCheckingDeps(true);
		setDepCheckError(null);
		try {
			const result = await invoke<DebDependencyCheck>(
				"check_local_deb_dependencies",
				{ filePath },
			);
			setDepCheck(result);
		} catch (err) {
			setDepCheck(null);
			setDepCheckError(String(err));
		} finally {
			setCheckingDeps(false);
		}
	}, [filePath]);

	// Rendered with InsightRow so the checked result looks like every other
	// finding in the modal.
	const depCheckInsight = useMemo<Insight | null>(() => {
		if (!depCheck) return null;
		const raw = [
			depCheck.update_raw.trim()
				? `# apt-get update\n${depCheck.update_raw.trim()}`
				: "",
			`# apt-get -s install (simulation, nothing is changed)\n${depCheck.simulation_raw.trim()}`,
		]
			.filter(Boolean)
			.join("\n\n");

		if (!depCheck.ok) {
			// A failed resolution is a real answer, not a broken check: apt ran and
			// could not satisfy the package with the configured repositories.
			if (depCheck.unmet.length > 0) {
				return {
					key: "depcheck",
					title: `Cannot be installed: ${depCheck.unmet.length} unmet ${
						depCheck.unmet.length === 1 ? "requirement" : "requirements"
					}`,
					detail:
						"apt resolved the plan, but your configured repositories cannot satisfy it. The package probably needs a vendor repository or PPA that is not enabled.",
					level: "risk",
					items: depCheck.unmet,
					raw,
					rawLabel: "Show apt output",
				};
			}
			return {
				key: "depcheck",
				title: "Dependency check failed",
				detail:
					depCheck.error ??
					"apt could not resolve the dependencies of this package.",
				level: "warn",
				raw,
				rawLabel: "Show apt output",
			};
		}

		const total =
			depCheck.plan_new.length +
			depCheck.plan_upgrade.length +
			depCheck.plan_remove.length;
		const parts = [`${depCheck.plan_new.length} new`];
		if (depCheck.plan_upgrade.length > 0)
			parts.push(`${depCheck.plan_upgrade.length} upgraded`);
		if (depCheck.plan_remove.length > 0)
			parts.push(`${depCheck.plan_remove.length} removed`);
		return {
			key: "depcheck",
			title: "Dependencies resolved",
			detail: `${parts.join(" · ")} package${
				total === 1 ? "" : "s"
			} affected, ${
				depCheck.privileged
					? "resolved with administrator access and fresh package lists."
					: "resolved against the package lists already on disk."
			}`,
			level: depCheck.plan_remove.length > 0 ? "warn" : "info",
			items: [
				...depCheck.plan_new.map((p) => `+ ${p}`),
				...depCheck.plan_upgrade.map((p) => `↑ ${p}`),
				...depCheck.plan_remove.map((p) => `− ${p}`),
			],
			raw,
			rawLabel: "Show apt output",
		};
	}, [depCheck]);

	const declaredDeps = info
		? [
				{ label: "Depends", values: info.depends },
				{ label: "Pre-Depends", values: info.pre_depends },
				{ label: "Recommends", values: info.recommends },
				{ label: "Suggests", values: info.suggests },
				{ label: "Provides", values: info.provides },
			].filter((d) => d.values.length > 0)
		: [];

	return (
		<Dialog
			open={open}
			onClose={phase === "installing" ? undefined : onClose}
			maxWidth="md"
			fullWidth
			// Two shadow layers, core + cast, the way the book's "Shadows → Create
			// Realism with Shadows" describes a real elevation instead of one flat
			// blur, and never a light shadow on a dark surface ("Shadows in Dark
			// Mode").
			slotProps={{
				paper: {
					sx: {
						boxShadow:
							"0 1px 2px rgba(0,0,0,0.45), 0 16px 40px rgba(0,0,0,0.45)",
					},
				},
			}}
		>
			<DialogContent sx={{ p: 0 }}>
				{/* Header bar */}
				<Box
					sx={{
						px: 3,
						pt: 3,
						pb: 2,
						borderBottom: `1px solid ${lines.subtle}`,
						display: "flex",
						alignItems: "center",
						gap: 1.5,
					}}
				>
					<FolderOpenIcon
						sx={{ color: brand.primary, opacity: 0.7, fontSize: "1.5rem" }}
					/>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography
							sx={{
								fontFamily: "IBM Plex Sans, sans-serif",
								fontWeight: 700,
								fontSize: "1.125rem",
								color: neutral[1000],
								lineHeight: 1.2,
							}}
						>
							Install local package
						</Typography>
						<Typography
							noWrap
							sx={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: "0.75rem",
								color: "rgba(255,255,255,0.4)",
								mt: 0.25,
							}}
						>
							{filePath}
						</Typography>
					</Box>
				</Box>

				{phase !== "loading" && <StepIndicator phase={phase} />}

				{/* Loading */}
				{phase === "loading" && (
					<Box sx={{ px: 3, py: 5, textAlign: "center" }}>
						<CircularProgress size={36} sx={{ color: brand.primary, mb: 2 }} />
						<Typography
							sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}
						>
							Analyzing package…
						</Typography>
						<Typography
							sx={{
								color: "rgba(255,255,255,0.3)",
								fontSize: "0.75rem",
								mt: 1,
							}}
						>
							Reading control data, contents and simulating dependencies
						</Typography>
					</Box>
				)}

				{/* Error while analyzing: same feedback screen, no log to offer */}
				{phase === "error" && !info && (
					<FeedbackScreen
						outcome="failure"
						title="Could not read package"
						detail={loadError ?? "The file could not be inspected."}
						logs={[]}
						actionLabel="Close"
						onAction={onClose}
					/>
				)}

				{/* Review */}
				{phase === "review" && info && assessment && (
					<Box>
						{/* Identity */}
						<Box sx={{ px: 3, py: 3 }}>
							<Stack direction="row" spacing={2} alignItems="flex-start">
								<Inventory2OutlinedIcon
									sx={{ color: "rgba(255,255,255,0.25)", fontSize: "2.5rem" }}
								/>
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography
										sx={{
											fontFamily: "IBM Plex Sans, sans-serif",
											fontWeight: 700,
											fontSize: "1.25rem",
											color: neutral[1000],
											lineHeight: 1.2,
										}}
									>
										{info.package}
										{info.version ? ` ${info.version}` : ""}
									</Typography>
									<Typography
										sx={{
											fontSize: "0.8125rem",
											color: "rgba(255,255,255,0.55)",
											mt: 0.5,
										}}
									>
										{info.description?.split("\n")[0] || "No synopsis provided"}
									</Typography>
									<Stack
										direction="row"
										spacing={1}
										sx={{ mt: 1.5, flexWrap: "wrap", gap: 0.75 }}
									>
										{[
											info.architecture,
											info.section,
											`File ${formatBytes(info.file_size_bytes)}`,
											`Installs ${formatBytes(info.data_bytes)}`,
											info.installed_size_kb > 0
												? `Declared ${formatBytes(info.installed_size_kb * 1024)}`
												: null,
										]
											.filter(Boolean)
											.map((chip) => (
												<Chip
													key={String(chip)}
													label={chip}
													size="small"
													sx={{
														fontFamily: "JetBrains Mono, monospace",
														fontSize: "0.6875rem",
														backgroundColor: lines.subtle,
														color: "rgba(255,255,255,0.55)",
														border: `1px solid ${lines.default}`,
													}}
												/>
											))}
										{info.maintainer && (
											<Chip
												label={info.maintainer}
												size="small"
												sx={{
													fontFamily: "JetBrains Mono, monospace",
													fontSize: "0.6875rem",
													backgroundColor: "rgba(74,134,207,0.12)",
													color: status.info,
													border: "1px solid rgba(74,134,207,0.25)",
												}}
											/>
										)}
									</Stack>
								</Box>
								<Box
									sx={{
										px: 1.25,
										py: 0.4,
										borderRadius: 1,
										backgroundColor: `${verdictColor[verdict]}18`,
										border: `1px solid ${verdictColor[verdict]}40`,
										flexShrink: 0,
									}}
								>
									<Typography
										sx={{
											fontFamily: "JetBrains Mono, monospace",
											fontSize: "0.75rem",
											fontWeight: 700,
											color: verdictColor[verdict],
											textTransform: "uppercase",
											letterSpacing: 0.5,
										}}
									>
										{verdictLabel[verdict]}
									</Typography>
								</Box>
							</Stack>

							{assessment.blockers.length > 0 && (
								<Box
									sx={{
										mt: 2,
										px: 2,
										py: 1,
										borderRadius: 1.5,
										backgroundColor: "rgba(229,75,75,0.08)",
										border: "1px solid rgba(229,75,75,0.3)",
									}}
								>
									{assessment.blockers.map((b) => (
										<Typography
											key={b}
											sx={{
												fontSize: "0.8125rem",
												color: hues.red,
												lineHeight: 1.5,
											}}
										>
											{b}
										</Typography>
									))}
								</Box>
							)}
						</Box>

						<Divider sx={{ borderColor: lines.subtle }} />

						{/* What it does */}
						<Box sx={{ px: 3, py: 3 }}>
							<SectionTitle
								icon={<SecurityIcon sx={{ fontSize: "1rem" }} />}
								title="What it will do"
							/>
							<Stack spacing={0.75}>
								{assessment.insights.map((insight) => (
									<InsightRow key={insight.key} insight={insight} />
								))}
							</Stack>
						</Box>

						{/* Dependencies */}
						<Divider sx={{ borderColor: lines.subtle }} />
						<Box sx={{ px: 3, py: 3 }}>
							<SectionTitle
								icon={<CheckCircleIcon sx={{ fontSize: "1rem" }} />}
								title="Dependencies"
							/>
							{declaredDeps.length > 0 ? (
								declaredDeps.map((dep) => (
									<ChipRow
										key={dep.label}
										label={dep.label}
										values={dep.values}
									/>
								))
							) : (
								<Typography
									sx={{
										fontSize: "0.75rem",
										color: "rgba(255,255,255,0.45)",
									}}
								>
									This package does not declare any dependency.
								</Typography>
							)}

							{/* The real answer needs fresh package lists, hence root. */}
							<Box
								sx={{
									mt: 1.5,
									display: "flex",
									alignItems: "center",
									gap: 1.5,
									flexWrap: "wrap",
								}}
							>
								<Button
									onClick={handleDependencyCheck}
									disabled={checkingDeps}
									variant="outlined"
									size="small"
									startIcon={
										checkingDeps ? (
											<CircularProgress size={14} sx={{ color: "inherit" }} />
										) : (
											<NetworkCheckIcon sx={{ fontSize: "1rem" }} />
										)
									}
									sx={{
										fontFamily: "IBM Plex Sans, sans-serif",
										fontWeight: 600,
										fontSize: "0.75rem",
										textTransform: "none",
									}}
								>
									{checkingDeps
										? "Checking…"
										: depCheck
											? "Check again"
											: "Check dependencies"}
								</Button>
								<Stack
									direction="row"
									spacing={0.75}
									alignItems="center"
									sx={{ color: "rgba(255,255,255,0.45)" }}
								>
									<LockOutlinedIcon sx={{ fontSize: "0.875rem" }} />
									<Typography sx={{ fontSize: "0.75rem", lineHeight: 1.4 }}>
										Needs administrator access: you will be asked for your
										password, and the package lists are refreshed first.
									</Typography>
								</Stack>
							</Box>

							{depCheckError && (
								<Typography
									sx={{
										mt: 1.5,
										fontSize: "0.75rem",
										color: hues.orangeDeep,
										lineHeight: 1.5,
									}}
								>
									{depCheckError}
								</Typography>
							)}

							{depCheck?.notice && (
								<Box
									sx={{
										mt: 1.5,
										px: 2,
										py: 1,
										borderRadius: 1.5,
										backgroundColor: "rgba(246,211,45,0.06)",
										border: "1px solid rgba(246,211,45,0.2)",
										display: "flex",
										gap: 1,
										alignItems: "flex-start",
									}}
								>
									<WarningAmberIcon
										sx={{
											fontSize: "0.875rem",
											color: brand.secondary,
											mt: 0.15,
											flexShrink: 0,
										}}
									/>
									<Typography
										sx={{
											fontSize: "0.75rem",
											color: "rgba(255,255,255,0.55)",
											lineHeight: 1.5,
										}}
									>
										{depCheck?.notice}
									</Typography>
								</Box>
							)}

							{depCheckInsight && (
								<Box sx={{ mt: 1.5 }}>
									<InsightRow insight={depCheckInsight} />
								</Box>
							)}
						</Box>

						{/* Technical details */}
						<Divider sx={{ borderColor: lines.subtle }} />
						<Box sx={{ px: 3, py: 2 }}>
							<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
								<Button
									onClick={() => setShowRawControl((v) => !v)}
									size="small"
									color="neutral"
									endIcon={
										showRawControl ? (
											<ExpandLessIcon sx={{ fontSize: "1rem" }} />
										) : (
											<ExpandMoreIcon sx={{ fontSize: "1rem" }} />
										)
									}
									sx={{
										fontFamily: "JetBrains Mono, monospace",
										fontSize: "0.75rem",
										minHeight: 36,
									}}
								>
									{showRawControl ? "Hide control file" : "Show control file"}
								</Button>
								<Tooltip title={info.sha256} placement="top" arrow>
									<Typography
										sx={{
											fontFamily: "JetBrains Mono, monospace",
											fontSize: "0.6875rem",
											color: "rgba(255,255,255,0.35)",
											alignSelf: "center",
										}}
									>
										sha256 {info.sha256.slice(0, 16)}…
									</Typography>
								</Tooltip>
							</Box>
							<Collapse in={showRawControl}>
								<CodeBlock text={info.raw_control} />
							</Collapse>
						</Box>

						{/* Source note */}
						<Box
							sx={{
								mx: 3,
								mb: 2.5,
								px: 2,
								py: 1,
								borderRadius: 1.5,
								backgroundColor: "rgba(246,211,45,0.06)",
								border: "1px solid rgba(246,211,45,0.2)",
								display: "flex",
								gap: 1,
								alignItems: "flex-start",
							}}
						>
							<WarningAmberIcon
								sx={{
									fontSize: "0.875rem",
									color: brand.secondary,
									mt: 0.15,
									flexShrink: 0,
								}}
							/>
							<Typography
								sx={{
									fontSize: "0.75rem",
									color: "rgba(255,255,255,0.55)",
									lineHeight: 1.5,
								}}
							>
								This is a{" "}
								<strong style={{ color: "rgba(255,255,255,0.75)" }}>
									local file
								</strong>
								, not something from a repository. Unlike a Flatpak, a .deb app
								is{" "}
								<strong style={{ color: "rgba(255,255,255,0.75)" }}>
									not sandboxed
								</strong>
								: it runs with your user's full access, its installer scripts
								run as root, and the install requires your administrator
								password. Only install software from sources you trust.
							</Typography>
						</Box>

						{/* Actions */}
						<Divider sx={{ borderColor: lines.subtle }} />
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ px: 3, py: 2, justifyContent: "flex-end" }}
						>
							<Button onClick={onClose} color="neutral" sx={{ minHeight: 36 }}>
								Cancel
							</Button>
							<Button
								onClick={handleInstall}
								// For a high-risk package the install is not the visually
								// dominant action: the book's "Buttons → Button Placement"
								// notes that prominent, filled placement is deliberately
								// reserved and swapped when a flow wants to discourage a
								// destructive action. The position stays (advance on the
								// right); only the weight drops.
								variant={verdict === "risk" ? "outlined" : "contained"}
								color={verdict === "risk" ? "error" : "primary"}
								sx={{ minHeight: 36 }}
								disabled={
									blocked || (Boolean(needsDowngrade) && !allowDowngrade)
								}
							>
								{info.already_installed ? "Reinstall" : "Install"}
							</Button>
						</Stack>
						{needsDowngrade && (
							<Box sx={{ px: 3, pb: 2, mt: -1, textAlign: "right" }}>
								<Button
									onClick={() => setAllowDowngrade(true)}
									size="small"
									color="neutral"
									sx={{ fontSize: "0.75rem" }}
								>
									{allowDowngrade
										? "Downgrade allowed"
										: "This is a downgrade — click to allow it"}
								</Button>
							</Box>
						)}
					</Box>
				)}

				{/* Installing: progress now, console one click away */}
				{phase === "installing" && (
					<Box sx={{ px: 3, py: 3 }}>
						<Stack
							direction="row"
							spacing={1.5}
							alignItems="center"
							sx={{ mb: 2 }}
						>
							<CircularProgress size={18} sx={{ color: brand.primary }} />
							<Typography
								sx={{
									fontFamily: "IBM Plex Sans, sans-serif",
									fontWeight: 600,
									fontSize: "0.875rem",
									color: neutral[1000],
								}}
							>
								{`Installing ${info?.package ?? ""}…`}
							</Typography>
						</Stack>

						<LinearProgress
							sx={{
								mb: 2,
								borderRadius: 1,
								backgroundColor: "rgba(74,134,207,0.15)",
								"& .MuiLinearProgress-bar": {
									backgroundColor: brand.primary,
								},
							}}
						/>

						<Button
							onClick={() => setShowTerminal((v) => !v)}
							size="small"
							color="neutral"
							endIcon={
								showTerminal ? (
									<ExpandLessIcon sx={{ fontSize: "1rem" }} />
								) : (
									<ExpandMoreIcon sx={{ fontSize: "1rem" }} />
								)
							}
							sx={{ minHeight: 36 }}
						>
							Logs
						</Button>

						<Collapse in={showTerminal}>
							<Box
								sx={{
									mt: 1.5,
									borderRadius: 1.5,
									overflow: "hidden",
									border: "1px solid rgba(255,255,255,0.08)",
								}}
							>
								<Terminal output={terminalLines} isRunning={true} />
							</Box>
						</Collapse>
					</Box>
				)}

				{/* Done: feedback, not a log dump */}
				{phase === "done" && (
					<FeedbackScreen
						outcome="success"
						title="Installation complete"
						detail={`${info?.package ?? "The package"}${
							info?.version ? ` ${info.version}` : ""
						} is installed.`}
						logs={terminalLines}
						actionLabel="Done"
						onAction={onClose}
					/>
				)}

				{/* Failed: same screen, with the reason and the log behind Logs */}
				{phase === "error" && info && (
					<FeedbackScreen
						outcome="failure"
						title="Installation failed"
						detail={installError ?? "apt could not complete the installation."}
						logs={terminalLines}
						actionLabel="Close"
						onAction={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
