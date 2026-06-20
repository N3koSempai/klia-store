import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "./Terminal";

interface LocalFlatpakPermissions {
	network: boolean;
	ipc: boolean;
	x11: boolean;
	wayland: boolean;
	pulseaudio: boolean;
	dri: boolean;
	filesystems: string[];
	session_bus: string[];
	system_bus: string[];
	devices: string[];
	sockets: string[];
}

interface LocalFlatpakDep {
	id: string;
	size: string;
}

interface LocalFlatpakInfo {
	app_id: string;
	name: string;
	branch: string;
	runtime: string;
	sdk: string;
	command: string;
	file_path: string;
	file_size_bytes: number;
	permissions: LocalFlatpakPermissions;
	dependencies: LocalFlatpakDep[];
	already_installed: boolean;
}

interface PermissionEntry {
	label: string;
	description: string;
	level: "safe" | "medium" | "high" | "critical";
}

function classifyPermissions(perms: LocalFlatpakPermissions): PermissionEntry[] {
	const entries: PermissionEntry[] = [];

	if (perms.network) {
		entries.push({
			label: "Network access",
			description: "Can make internet connections",
			level: "medium",
		});
	}

	for (const fs of perms.filesystems) {
		if (fs === "host" || fs === "host-os" || fs === "host-etc") {
			entries.push({
				label: `Full filesystem: ${fs}`,
				description: "Can read and write anywhere on your system",
				level: "critical",
			});
		} else if (fs === "home") {
			entries.push({
				label: "Home directory",
				description: "Can read and write your entire home folder",
				level: "high",
			});
		} else {
			entries.push({
				label: `Filesystem: ${fs}`,
				description: "Limited filesystem access",
				level: "medium",
			});
		}
	}

	if (perms.session_bus.some((b) => b.includes("org.freedesktop.Flatpak"))) {
		entries.push({
			label: "Flatpak access (D-Bus)",
			description: "Can control or spawn other Flatpak apps",
			level: "high",
		});
	}

	if (perms.system_bus.length > 0) {
		entries.push({
			label: "System D-Bus access",
			description: "Can talk to privileged system services",
			level: "high",
		});
	}

	if (perms.devices.includes("all")) {
		entries.push({
			label: "All devices",
			description: "Full access to hardware devices",
			level: "high",
		});
	} else if (perms.dri) {
		entries.push({
			label: "GPU / DRI",
			description: "Access to graphics hardware (needed for rendering)",
			level: "safe",
		});
	}

	if (perms.x11 && !perms.wayland) {
		entries.push({
			label: "X11 only (no Wayland)",
			description: "Uses legacy display protocol — weaker sandbox",
			level: "medium",
		});
	} else if (perms.wayland) {
		entries.push({
			label: "Wayland display",
			description: "Modern display protocol with better sandboxing",
			level: "safe",
		});
	}

	if (perms.pulseaudio) {
		entries.push({
			label: "Audio (PulseAudio)",
			description: "Can play and record audio",
			level: "safe",
		});
	}

	if (perms.ipc) {
		entries.push({
			label: "IPC (shared memory)",
			description: "Can share memory with other processes",
			level: "medium",
		});
	}

	return entries;
}

function riskScore(entries: PermissionEntry[]): { score: "low" | "medium" | "high" | "critical"; label: string } {
	if (entries.some((e) => e.level === "critical")) return { score: "critical", label: "Critical risk" };
	const highCount = entries.filter((e) => e.level === "high").length;
	if (highCount >= 2) return { score: "high", label: "High risk" };
	if (highCount === 1) return { score: "high", label: "Elevated risk" };
	if (entries.some((e) => e.level === "medium")) return { score: "medium", label: "Moderate risk" };
	return { score: "low", label: "Low risk" };
}

const levelColor: Record<string, string> = {
	safe: "#4CAF50",
	medium: "#F6D32D",
	high: "#FF9800",
	critical: "#FF5252",
};

const riskColor: Record<string, string> = {
	low: "#4CAF50",
	medium: "#F6D32D",
	high: "#FF9800",
	critical: "#FF5252",
};

function formatBytes(bytes: number): string {
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
	return `${bytes} B`;
}

interface LocalFlatpakInstallModalProps {
	filePath: string | null;
	onClose: () => void;
}

type Phase = "loading" | "review" | "installing" | "done" | "error";

export function LocalFlatpakInstallModal({ filePath, onClose }: LocalFlatpakInstallModalProps) {
	const [phase, setPhase] = useState<Phase>("loading");
	const [info, setInfo] = useState<LocalFlatpakInfo | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [terminalLines, setTerminalLines] = useState<string[]>([]);
	const [showDeps, setShowDeps] = useState(false);
	const [showTerminal, setShowTerminal] = useState(false);
	const processKey = useRef<string | null>(null);

	const open = filePath !== null;

	// Load info when file changes
	useEffect(() => {
		if (!filePath) return;
		setPhase("loading");
		setInfo(null);
		setLoadError(null);
		setTerminalLines([]);

		invoke<LocalFlatpakInfo>("inspect_local_flatpak", { filePath })
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
		setTerminalLines([]);
		setShowTerminal(true);
		processKey.current = `local::${filePath}`;

		const unlisteners: UnlistenFn[] = [];

		const unlistenOutput = await listen<[string, string]>("pty-output", (event) => {
			const [key, line] = event.payload;
			if (key === processKey.current) {
				setTerminalLines((prev) => [...prev, line]);
			}
		});
		unlisteners.push(unlistenOutput);

		const unlistenError = await listen<[string, string]>("pty-error", (event) => {
			const [key, line] = event.payload;
			if (key === processKey.current) {
				setTerminalLines((prev) => [...prev, `[stderr] ${line}`]);
			}
		});
		unlisteners.push(unlistenError);

		const unlistenDone = await listen<string>("pty-terminated", (event) => {
			if (event.payload === processKey.current) {
				setPhase("done");
				for (const fn of unlisteners) fn();
			}
		});
		unlisteners.push(unlistenDone);

		try {
			await invoke("install_local_flatpak", { filePath });
		} catch (err) {
			setTerminalLines((prev) => [...prev, `Error: ${err}`]);
			setPhase("error");
			for (const fn of unlisteners) fn();
		}
	}, [filePath]);

	const permEntries = info ? classifyPermissions(info.permissions) : [];
	const risk = info ? riskScore(permEntries) : null;

	return (
		<Dialog
			open={open}
			onClose={phase === "installing" ? undefined : onClose}
			maxWidth="sm"
			fullWidth
			slotProps={{
				paper: {
					sx: {
						backgroundColor: "#0D1117",
						border: "1px solid rgba(255,255,255,0.08)",
						borderRadius: 3,
						overflow: "hidden",
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
						borderBottom: "1px solid rgba(255,255,255,0.06)",
						display: "flex",
						alignItems: "center",
						gap: 1.5,
					}}
				>
					<FolderOpenIcon sx={{ color: "#4A86CF", fontSize: "1.4rem" }} />
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography
							sx={{
								fontFamily: "IBM Plex Sans, sans-serif",
								fontWeight: 700,
								fontSize: "1rem",
								color: "#FFFFFF",
								lineHeight: 1.2,
							}}
						>
							Install from file
						</Typography>
						<Typography
							noWrap
							sx={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: "0.7rem",
								color: "rgba(255,255,255,0.4)",
								mt: 0.25,
							}}
						>
							{filePath}
						</Typography>
					</Box>
				</Box>

				{/* Loading */}
				{phase === "loading" && (
					<Box sx={{ px: 3, py: 5, textAlign: "center" }}>
						<CircularProgress size={36} sx={{ color: "#4A86CF", mb: 2 }} />
						<Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>
							Analyzing package…
						</Typography>
					</Box>
				)}

				{/* Error loading */}
				{phase === "error" && !info && (
					<Box sx={{ px: 3, py: 4, textAlign: "center" }}>
						<ErrorOutlineIcon sx={{ color: "#FF5252", fontSize: "2.5rem", mb: 1.5 }} />
						<Typography sx={{ color: "#FF5252", fontWeight: 600, mb: 1 }}>
							Could not read package
						</Typography>
						<Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
							{loadError}
						</Typography>
						<Button onClick={onClose} sx={{ mt: 3, color: "rgba(255,255,255,0.6)" }}>
							Close
						</Button>
					</Box>
				)}

				{/* Review phase */}
				{phase === "review" && info && (
					<Box>
						{/* App identity */}
						<Box sx={{ px: 3, py: 2.5 }}>
							<Stack direction="row" spacing={2} alignItems="flex-start">
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography
										sx={{
											fontFamily: "IBM Plex Sans, sans-serif",
											fontWeight: 700,
											fontSize: "1.25rem",
											color: "#FFFFFF",
											lineHeight: 1.2,
										}}
									>
										{info.name}
									</Typography>
									<Typography
										sx={{
											fontFamily: "JetBrains Mono, monospace",
											fontSize: "0.72rem",
											color: "rgba(255,255,255,0.4)",
											mt: 0.5,
										}}
									>
										{info.app_id}
									</Typography>

									<Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 0.75 }}>
										<Chip
											label={`Branch: ${info.branch || "master"}`}
											size="small"
											sx={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.65rem", backgroundColor: "rgba(74,134,207,0.15)", color: "#58A6FF", border: "1px solid rgba(74,134,207,0.3)" }}
										/>
										<Chip
											label={`Runtime: ${info.runtime.split("/")[0]}`}
											size="small"
											sx={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.65rem", backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
										/>
										<Chip
											label={`File: ${formatBytes(info.file_size_bytes)}`}
											size="small"
											sx={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.65rem", backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
										/>
										{info.already_installed && (
											<Chip
												label="Already installed"
												size="small"
												sx={{ fontFamily: "IBM Plex Sans, sans-serif", fontSize: "0.65rem", backgroundColor: "rgba(76,175,80,0.15)", color: "#4CAF50", border: "1px solid rgba(76,175,80,0.3)" }}
											/>
										)}
									</Stack>
								</Box>
							</Stack>
						</Box>

						<Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />

						{/* Security analysis */}
						<Box sx={{ px: 3, py: 2.5 }}>
							<Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
								<SecurityIcon sx={{ fontSize: "1rem", color: risk ? riskColor[risk.score] : "#fff" }} />
								<Typography
									sx={{
										fontFamily: "IBM Plex Sans, sans-serif",
										fontWeight: 700,
										fontSize: "0.875rem",
										color: "#FFFFFF",
										flex: 1,
									}}
								>
									Security Analysis
								</Typography>
								{risk && (
									<Box
										sx={{
											px: 1.25,
											py: 0.4,
											borderRadius: 1,
											backgroundColor: `${riskColor[risk.score]}18`,
											border: `1px solid ${riskColor[risk.score]}40`,
										}}
									>
										<Typography
											sx={{
												fontFamily: "JetBrains Mono, monospace",
												fontSize: "0.7rem",
												fontWeight: 700,
												color: riskColor[risk.score],
												textTransform: "uppercase",
												letterSpacing: 0.5,
											}}
										>
											{risk.label}
										</Typography>
									</Box>
								)}
							</Stack>

							{permEntries.length === 0 ? (
								<Stack direction="row" spacing={1} alignItems="center">
									<CheckCircleIcon sx={{ color: "#4CAF50", fontSize: "1rem" }} />
									<Typography sx={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
										No special permissions requested
									</Typography>
								</Stack>
							) : (
								<Stack spacing={0.75}>
									{permEntries.map((entry) => (
										<Tooltip key={entry.label} title={entry.description} placement="right" arrow>
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 1.25,
													px: 1.5,
													py: 0.9,
													borderRadius: 1.5,
													backgroundColor: `${levelColor[entry.level]}0d`,
													border: `1px solid ${levelColor[entry.level]}25`,
													cursor: "default",
												}}
											>
												<Box
													sx={{
														width: 7,
														height: 7,
														borderRadius: "50%",
														backgroundColor: levelColor[entry.level],
														flexShrink: 0,
													}}
												/>
												<Typography
													sx={{
														fontFamily: "IBM Plex Sans, sans-serif",
														fontSize: "0.8rem",
														color: "rgba(255,255,255,0.85)",
														flex: 1,
													}}
												>
													{entry.label}
												</Typography>
												<InfoOutlinedIcon sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.2)" }} />
											</Box>
										</Tooltip>
									))}
								</Stack>
							)}
						</Box>

						{/* Dependencies */}
						{info.dependencies.length > 0 && (
							<>
								<Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
								<Box sx={{ px: 3, py: 1.5 }}>
									<Button
										onClick={() => setShowDeps((v) => !v)}
										sx={{
											textTransform: "none",
											color: "rgba(255,255,255,0.5)",
											fontSize: "0.8rem",
											fontFamily: "IBM Plex Sans, sans-serif",
											p: 0,
											"&:hover": { color: "rgba(255,255,255,0.8)", background: "none" },
										}}
									>
										<NetworkCheckIcon sx={{ fontSize: "0.9rem", mr: 0.75 }} />
										{info.dependencies.length} runtime{info.dependencies.length !== 1 ? "s" : ""} required
										{showDeps ? " ▲" : " ▼"}
									</Button>
									<Collapse in={showDeps}>
										<Stack spacing={0.5} sx={{ mt: 1.25 }}>
											{info.dependencies.map((dep) => (
												<Box
													key={dep.id}
													sx={{
														display: "flex",
														justifyContent: "space-between",
														px: 1.5,
														py: 0.6,
														borderRadius: 1,
														backgroundColor: "rgba(255,255,255,0.03)",
														border: "1px solid rgba(255,255,255,0.06)",
													}}
												>
													<Typography
														sx={{
															fontFamily: "JetBrains Mono, monospace",
															fontSize: "0.72rem",
															color: "rgba(255,255,255,0.6)",
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															flex: 1,
															mr: 2,
														}}
													>
														{dep.id}
													</Typography>
													<Typography
														sx={{
															fontFamily: "JetBrains Mono, monospace",
															fontSize: "0.72rem",
															color: "rgba(255,255,255,0.4)",
															flexShrink: 0,
														}}
													>
														{dep.size}
													</Typography>
												</Box>
											))}
										</Stack>
									</Collapse>
								</Box>
							</>
						)}

						{/* Source note */}
						<Box
							sx={{
								mx: 3,
								mb: 2.5,
								px: 2,
								py: 1.25,
								borderRadius: 1.5,
								backgroundColor: "rgba(246,211,45,0.06)",
								border: "1px solid rgba(246,211,45,0.2)",
								display: "flex",
								gap: 1,
								alignItems: "flex-start",
							}}
						>
							<WarningAmberIcon sx={{ fontSize: "0.9rem", color: "#F6D32D", mt: 0.15, flexShrink: 0 }} />
							<Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
								This package is from a <strong style={{ color: "rgba(255,255,255,0.75)" }}>local file</strong>,
								not from Flathub. Only install software from sources you trust.
							</Typography>
						</Box>

						{/* Actions */}
						<Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
						<Stack direction="row" spacing={1.5} sx={{ px: 3, py: 2, justifyContent: "flex-end" }}>
							<Button
								onClick={onClose}
								sx={{
									textTransform: "none",
									color: "rgba(255,255,255,0.5)",
									fontFamily: "IBM Plex Sans, sans-serif",
									"&:hover": { color: "rgba(255,255,255,0.8)" },
								}}
							>
								Cancel
							</Button>
							<Button
								onClick={handleInstall}
								variant="contained"
								sx={{
									textTransform: "none",
									fontFamily: "IBM Plex Sans, sans-serif",
									fontWeight: 600,
									backgroundColor: risk?.score === "critical" ? "#FF5252" : "#4A86CF",
									"&:hover": {
										backgroundColor: risk?.score === "critical" ? "#E53935" : "#3d74b8",
									},
								}}
							>
								{info.already_installed ? "Reinstall" : "Install"}
							</Button>
						</Stack>
					</Box>
				)}

				{/* Installing phase */}
				{(phase === "installing" || (phase === "done" && info)) && (
					<Box>
						<Box sx={{ px: 3, py: 2.5 }}>
							<Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
								{phase === "installing" ? (
									<CircularProgress size={18} sx={{ color: "#4A86CF" }} />
								) : (
									<CheckCircleIcon sx={{ color: "#4CAF50", fontSize: "1.2rem" }} />
								)}
								<Typography
									sx={{
										fontFamily: "IBM Plex Sans, sans-serif",
										fontWeight: 600,
										fontSize: "0.9rem",
										color: phase === "done" ? "#4CAF50" : "#FFFFFF",
									}}
								>
									{phase === "installing" ? `Installing ${info?.name ?? ""}…` : "Installation complete"}
								</Typography>
							</Stack>

							{phase === "installing" && (
								<LinearProgress
									sx={{
										mb: 2,
										borderRadius: 1,
										backgroundColor: "rgba(74,134,207,0.15)",
										"& .MuiLinearProgress-bar": { backgroundColor: "#4A86CF" },
									}}
								/>
							)}

							<Button
								onClick={() => setShowTerminal((v) => !v)}
								size="small"
								sx={{
									textTransform: "none",
									color: "rgba(255,255,255,0.4)",
									fontSize: "0.75rem",
									fontFamily: "JetBrains Mono, monospace",
									p: 0,
									"&:hover": { color: "rgba(255,255,255,0.7)", background: "none" },
								}}
							>
								{showTerminal ? "Hide output ▲" : "Show output ▼"}
							</Button>

							<Collapse in={showTerminal}>
								<Box sx={{ mt: 1.5, borderRadius: 1.5, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
									<Terminal output={terminalLines} isRunning={phase === "installing"} />
								</Box>
							</Collapse>
						</Box>

						{phase === "done" && (
							<>
								<Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
								<Box sx={{ px: 3, py: 2, display: "flex", justifyContent: "flex-end" }}>
									<Button
										onClick={onClose}
										variant="contained"
										sx={{
											textTransform: "none",
											fontFamily: "IBM Plex Sans, sans-serif",
											fontWeight: 600,
											backgroundColor: "#4CAF50",
											"&:hover": { backgroundColor: "#43A047" },
										}}
									>
										Done
									</Button>
								</Box>
							</>
						)}
					</Box>
				)}
			</DialogContent>
		</Dialog>
	);
}
