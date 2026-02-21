import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  ArrowBack,
  ChevronLeft,
  ChevronRight,
  Delete,
} from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { AppActionButton } from "../../components/AppActionButton";
import { AppMetaCapsule } from "../../components/AppMetaCapsule";
import { CachedImage } from "../../components/CachedImage";
import { DependencyInfoPopover } from "../../components/DependencyInfoPopover";
import { GitHubStarBadge } from "../../components/GitHubStarBadge";
import { Terminal } from "../../components/Terminal";
import { useAppScreenshots } from "../../hooks/useAppScreenshots";
import { useRepoStats } from "../../hooks/useRepoStats";
import { useRuntimeCheck } from "../../hooks/useRuntimeCheck";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import type { AppStream, CategoryApp } from "../../types";

// Import animations to ensure they are correctly bundled
import successAnim from "../../assets/animations/success.lottie";
import errorAnim from "../../assets/animations/Error.lottie";

interface AppDetailsProps {
  app: CategoryApp;
  onBack: () => void;
}

export const AppDetails = ({ app, onBack }: AppDetailsProps) => {
  const { t } = useTranslation();

  // Convert CategoryApp to AppStream for hooks that need it
  const appStream: AppStream = {
    id: app.app_id,
    name: app.name,
    summary: app.summary,
    description: app.description,
    icon: app.icon,
    screenshots: undefined,
    urls: undefined,
  };

  const {
    screenshots,
    urls,
    isLoading: isLoadingScreenshots,
  } = useAppScreenshots(appStream);
  const { isAppInstalled, setInstalledApp } = useInstalledAppsStore();
  const { stars, repoUrl } = useRepoStats(app.app_id, urls);
  const { dependencies, loading: loadingDeps } = useRuntimeCheck(app.app_id);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Generate stable UUIDs for screenshots
  const screenshotIds = useMemo(
    () => screenshots?.map(() => uuidv4()) || [],
    [screenshots],
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState<
    | "idle"
    | "verifying"
    | "verificationSuccess"
    | "verificationFailed"
    | "verificationUnsupported"
    | "verificationDetails"
    | "installing"
    | "success"
    | "error"
  >("idle");
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    sources: Array<{
      url: string;
      commit: string;
      verified: boolean;
      remote_commit?: string;
      error?: string;
      platform?: string;
    }>;
    error?: string;
    isHashMismatch: boolean;
    isUnsupportedPlatform: boolean;
  } | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [riskCountdown, setRiskCountdown] = useState<number | null>(null);
  const riskCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use ref to track isInstalling state in event listeners
  const isInstallingRef = useRef(false);
  const isUninstallingRef = useRef(false);
  const installSessionId = useRef<string | null>(null);

  // Update ref when isInstalling changes
  useEffect(() => {
    isInstallingRef.current = isInstalling;
  }, [isInstalling]);

  useEffect(() => {
    isUninstallingRef.current = isUninstalling;
  }, [isUninstalling]);

  // Check if app is already installed
  const isInstalled = isAppInstalled(app.app_id);

  // Auto-start risk countdown when hash mismatch is detected
  useEffect(() => {
    if (
      verificationResult?.isHashMismatch &&
      installStatus === "verificationFailed"
    ) {
      startRiskCountdown();
    }
  }, [verificationResult?.isHashMismatch, installStatus]);

  // Cleanup: kill PTY process and countdown when leaving the page
  useEffect(() => {
    return () => {
      if (installSessionId.current) {
        console.log("[AppDetails] Cleanup: killing PTY process");
        invoke("kill_pty_process", { appId: app.app_id }).catch(console.error);
        installSessionId.current = null;
      }
      clearCountdown();
    };
  }, [app.app_id]);

  // PTY events - listen only during installation
  // biome-ignore lint/correctness/useExhaustiveDependencies: Event listeners should only be set up once on mount
  useEffect(() => {
    console.log("[AppDetails] Setting up PTY listeners");

    // PTY events for installation output
    const unlistenPtyOutput = listen<[string, string]>(
      "pty-output",
      (event) => {
        const [appId, line] = event.payload;

        // Only process if this is our app AND we're installing (using ref for current value)
        if (appId === app.app_id && isInstallingRef.current) {
          // Split by \r to handle multiple updates in a single emission
          const parts = line.split("\r");

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const cleanPart = stripAnsi(part);

            // Only add non-empty lines
            if (cleanPart.trim()) {
              setInstallOutput((prev) => {
                // If it's not the first part of a split by \r, or the original line started with \r
                // we overwrite the last line in the terminal.
                if ((i > 0 || line.startsWith("\r")) && prev.length > 0) {
                  const newOutput = [...prev];
                  newOutput[newOutput.length - 1] = cleanPart;
                  return newOutput;
                }

                // Deduplication logic for multi-line blocks (like permissions/dependency lists)
                const isProgress =
                  cleanPart.includes("%") ||
                  cleanPart.includes("/") ||
                  cleanPart.includes("Installing") ||
                  cleanPart.includes("Updating");

                if (!isProgress) {
                  // If this exact line exists anywhere in the last 15 lines, skip it
                  const isHeaderOrInfo =
                    cleanPart.includes("permissions:") ||
                    cleanPart.includes("ID") ||
                    cleanPart.includes("Branch") ||
                    cleanPart.includes("Remote") ||
                    /^\s*\d+\./.test(cleanPart);

                  if (isHeaderOrInfo) {
                    const existsRecently = prev
                      .slice(-15)
                      .some((l) => l.trim() === cleanPart.trim());
                    if (existsRecently) return prev;
                  }

                  // Simple consecutive deduplication
                  if (prev.length > 0 && prev[prev.length - 1] === cleanPart) {
                    return prev;
                  }
                }

                return [...prev, cleanPart];
              });
            }
          }
        }
      },
    );

    const unlistenPtyError = listen<[string, string]>("pty-error", (event) => {
      const [appId, line] = event.payload;
      if (appId === app.app_id && isInstallingRef.current) {
        console.log("[AppDetails] PTY error during install:", line);
        setInstallOutput((prev) => [...prev, `Error: ${line}`]);
      }
    });

    const unlistenPtyTerminated = listen<string>("pty-terminated", (event) => {
      if (event.payload === app.app_id && isInstallingRef.current) {
        console.log("[AppDetails] PTY terminated during install");
        installSessionId.current = null;

        // Process terminated, verify actual installation status
        setTimeout(async () => {
          try {
            // Check if app was actually installed by querying the system
            const installed = await invoke<{ apps: Array<{ app_id: string }> }>(
              "get_installed_flatpaks",
            );
            const isNowInstalled = installed.apps.some(
              (a) => a.app_id === app.app_id,
            );

            setIsInstalling(false);

            if (isNowInstalled) {
              // Installation successful
              setInstallStatus("success");
              setInstallOutput((p) => {
                if (
                  p.some(
                    (l) => l === t("appDetails.installationCompletedSuccess"),
                  )
                )
                  return p;
                return [...p, "", t("appDetails.installationCompletedSuccess")];
              });
              setInstalledApp(app.app_id, true);
            } else {
              // Installation failed
              setInstallStatus("error");
              console.error(
                "[AppDetails] Installation failed - app not found in installed list",
              );
            }
          } catch (error) {
            console.error("[AppDetails] Error verifying installation:", error);
            setIsInstalling(false);
            setInstallStatus("error");
          }
        }, 500);
      }
    });

    return () => {
      unlistenPtyOutput.then((fn) => fn());
      unlistenPtyError.then((fn) => fn());
      unlistenPtyTerminated.then((fn) => fn());
    };
  }, [app.app_id, t, setInstalledApp]);

  // Función para limpiar HTML de la descripción
  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const handlePrevImage = () => {
    if (screenshots && screenshots.length > 0) {
      setCurrentImageIndex((prev) =>
        prev === 0 ? screenshots.length - 1 : prev - 1,
      );
    }
  };

  const handleNextImage = () => {
    if (screenshots && screenshots.length > 0) {
      setCurrentImageIndex((prev) =>
        prev === screenshots.length - 1 ? 0 : prev + 1,
      );
    }
  };

  // Function to strip ANSI escape codes while preserving Unicode block characters for progress bars
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Need to strip ANSI codes from terminal output
  const stripAnsi = (str: string) => {
    return (
      str
        // Remove ANSI escape sequences (ESC[...m for colors/formatting)
        .replace(/\x1b\[[0-9;]*m/g, "")
        // Remove cursor control sequences (ESC[...H, ESC[...A, etc.)
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
        // Remove sequences with ? prefix (like ESC[?25l for cursor hide)
        .replace(/\x1b\[(\?)?[0-9;]*[A-Za-z]/g, "")
        // Remove device status report sequences ([6n)
        .replace(/\[(\d+)n/g, "")
        // Normalize non-breaking spaces to regular spaces
        .replace(/\u00a0/g, " ")
      // Note: We intentionally preserve Unicode block characters (█, ▓, ▒, ░) for progress bars
    );
  };

  const clearCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (riskCountdownIntervalRef.current) {
      clearInterval(riskCountdownIntervalRef.current);
      riskCountdownIntervalRef.current = null;
    }
    setCountdown(5);
    setRiskCountdown(null);
  };

  const startRiskCountdown = () => {
    if (riskCountdownIntervalRef.current) {
      clearInterval(riskCountdownIntervalRef.current);
    }
    setRiskCountdown(5);
    riskCountdownIntervalRef.current = setInterval(() => {
      setRiskCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (riskCountdownIntervalRef.current) {
            clearInterval(riskCountdownIntervalRef.current);
            riskCountdownIntervalRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startInstallation = async () => {
    clearCountdown();
    setVerificationResult(null);
    isInstallingRef.current = true;
    setIsInstalling(true);
    setInstallStatus("installing");
    setInstallOutput([t("appDetails.preparingInstallation"), ""]);

    console.log("[AppDetails] Starting installation");

    try {
      // Kill any existing PTY process first (cleanup)
      await invoke("kill_pty_process", { appId: app.app_id }).catch(() => {
        // Ignore errors if no process exists
      });

      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Start fresh PTY process with automatic installation (using -y flag)
      await invoke("start_flatpak_interactive", { appId: app.app_id });
      installSessionId.current = app.app_id;

      console.log("[AppDetails] PTY process started successfully");
    } catch (error) {
      console.error("[AppDetails] Install error:", error);
      setIsInstalling(false);
      setInstallStatus("error");
      setInstallOutput((prev) => [
        ...prev,
        "",
        t("appDetails.errorInvokingCommand", { error }),
      ]);
      installSessionId.current = null;
    }
  };

  const handleInstall = async () => {
    // Start hash verification first
    setInstallStatus("verifying");
    setVerificationResult(null);
    setCountdown(5);

    console.log("[AppDetails] handleInstall - starting hash verification");

    try {
      // Verify app hash before installation
      const result = await invoke<{
        verified: boolean;
        app_id: string;
        sources: Array<{
          url: string;
          commit: string;
          verified: boolean;
          remote_commit?: string;
          error?: string;
          platform?: string;
        }>;
        error?: string;
      }>("verify_app_hash", { appId: app.app_id });

      console.log("[AppDetails] Hash verification result:", result);
      console.log("[AppDetails] Sources:", result.sources);
      console.log("[AppDetails] Error:", result.error);

      if (!result.verified) {
        // Determine the type of failure
        const source = result.sources[0];
        const errorMsg = source?.error || result.error || "";
        const platform = source?.platform || "unknown";

        // Check if platform is unsupported
        const isUnsupportedPlatform = platform === "unsupported";

        // Check if it's specifically a hash mismatch (prioridad más alta - es un error crítico)
        const isHashMismatch =
          errorMsg.toLowerCase().includes("hash mismatch") ||
          errorMsg.toLowerCase().includes("mismatch");

        // Check if it's a source/tag not found issue (warning - no es crítico)
        const isSourceUnavailable =
          !isHashMismatch &&
          (errorMsg.toLowerCase().includes("tag") ||
            errorMsg.toLowerCase().includes("could not verify") ||
            errorMsg.toLowerCase().includes("not found") ||
            errorMsg.toLowerCase().includes("failed to fetch"));

        console.log("[AppDetails] Verification failed:", {
          isHashMismatch,
          isSourceUnavailable,
          isUnsupportedPlatform,
          platform,
          error: errorMsg,
        });

        setVerificationResult({
          verified: false,
          sources: result.sources,
          error: result.error,
          isHashMismatch,
          isUnsupportedPlatform,
        });

        if (isUnsupportedPlatform) {
          setInstallStatus("verificationUnsupported");
        } else {
          setInstallStatus("verificationFailed");
        }
        return;
      }

      // Verification successful, show success state with countdown
      setVerificationResult({
        verified: true,
        sources: result.sources,
        isHashMismatch: false,
        isUnsupportedPlatform: false,
      });
      setInstallStatus("verificationSuccess");

      // Start countdown
      let count = 5;
      countdownIntervalRef.current = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearCountdown();
          startInstallation();
        }
      }, 1000);
    } catch (error) {
      console.error("[AppDetails] Verification error:", error);
      setVerificationResult({
        verified: false,
        sources: [],
        error: String(error),
        isHashMismatch: false,
        isUnsupportedPlatform: false,
      });
      setInstallStatus("verificationFailed");
    }
  };

  const handleForceContinue = () => {
    clearCountdown();
    startInstallation();
  };

  const handleCancelVerification = () => {
    clearCountdown();
    setInstallStatus("idle");
    setVerificationResult(null);
  };

  const handleShowVerificationDetails = () => {
    // Show details in terminal-like format
    if (verificationResult) {
      const verifiedLabel = verificationResult.verified
        ? t("appDetails.securityVerificationVerified")
        : t("appDetails.securityVerificationFailed");
      const details = [
        t("appDetails.securityVerificationDetailsTitle"),
        "==============================",
        "",
        `${t("appDetails.securityVerificationOverallStatus")}: ${verificationResult.verified ? "✓" : "✗"} ${verifiedLabel}`,
        "",
        `${t("appDetails.securityVerificationSourcesChecked")}:`,
        ...verificationResult.sources.map(
          (s) => `  [${s.verified ? "✓" : "✗"}] ${s.url}`,
        ),
        "",
        ...(verificationResult.error
          ? [
              `${t("appDetails.securityVerificationError")}: ${verificationResult.error}`,
            ]
          : []),
      ];
      setInstallOutput(details);
      setInstallStatus("verificationDetails");
    }
  };

  const handleDownloadLog = async () => {
    const logContent = installOutput.join("\n");
    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const defaultFileName = `install-log-${app.app_id}-${timestamp}.txt`;

    try {
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: "Text Files",
            extensions: ["txt"],
          },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, logContent);
      }
    } catch (error) {
      console.error("Error al guardar el log:", error);
    }
  };

  const handleAccept = () => {
    setInstallStatus("idle");
    setInstallOutput([]);
  };

  const handleLaunchApp = async () => {
    if (isInstalled) {
      try {
        await invoke("launch_flatpak", { appId: app.app_id });
      } catch (error) {
        console.error("Error launching app:", error);
      }
    }
  };

  const handleUninstall = async () => {
    if (isInstalled) {
      setIsUninstalling(true);
      try {
        await invoke("uninstall_flatpak", { appId: app.app_id });
        setInstalledApp(app.app_id, false);
      } catch (error) {
        console.error("Error uninstalling app:", error);
      } finally {
        setIsUninstalling(false);
      }
    }
  };

  // Determine button status
  const getButtonStatus = ():
    | "installed"
    | "missing"
    | "busy"
    | "verifying" => {
    if (isUninstalling) return "busy";
    if (installStatus === "installing") return "busy";
    if (installStatus === "verifying") return "verifying";
    if (installStatus === "verificationSuccess") return "busy";
    if (installStatus === "verificationFailed") return "busy";
    if (installStatus === "verificationUnsupported") return "busy";
    if (installStatus === "verificationDetails") return "busy";
    if (isInstalled) return "installed";
    return "missing";
  };

  return (
    <Box sx={{ p: 3, minHeight: "100vh" }}>
      {/* Botón de regreso */}
      <IconButton onClick={onBack} sx={{ mb: 2 }}>
        <ArrowBack />
      </IconButton>

      {/* Sección superior: Icono, Nombre y Botón Instalar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 4,
          pb: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Icono */}
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "grey.800",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {app.icon ? (
              <CachedImage
                appId={app.app_id}
                imageUrl={app.icon}
                alt={app.name}
                variant="rounded"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <Typography variant="caption" color="text.secondary">
                {t("appDetails.noIcon")}
              </Typography>
            )}
          </Box>

          {/* Nombre y Summary */}
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {app.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {app.summary}
            </Typography>

            {/* Metadata Row */}
            <Box
              sx={{ display: "flex", flexDirection: "row", gap: 2, mt: 1.5 }}
            >
              {stars !== null && repoUrl && (
                <GitHubStarBadge count={stars} url={repoUrl} />
              )}
              <AppMetaCapsule
                isVerified={app.verification_verified}
                license={app.project_license}
                downloads={app.installs_last_month}
              />
            </Box>
          </Box>
        </Box>

        {/* Install Button and Runtime Status */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            minWidth: 200,
          }}
        >
          <Box sx={{ display: "flex", gap: 1 }}>
            <AppActionButton
              status={getButtonStatus()}
              busyAction={isUninstalling ? "uninstalling" : "installing"}
              onAction={isInstalled ? handleLaunchApp : handleInstall}
              fullWidth
            />
            {isInstalled && !isUninstalling && (
              <Tooltip title={t("appDetails.uninstall")} arrow>
                <IconButton
                  onClick={handleUninstall}
                  sx={{
                    bgcolor: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "6px",
                    width: 48,
                    height: 48,
                    transition: "all 0.2s",
                    "&:hover": {
                      bgcolor: "rgba(239, 68, 68, 0.1)",
                      borderColor: "rgba(239, 68, 68, 0.3)",
                      color: "#ef4444",
                    },
                  }}
                >
                  <Delete />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Dependency Info Popover */}
          {!isInstalled &&
            installStatus === "idle" &&
            (loadingDeps ? (
              <Skeleton
                variant="rounded"
                width="100%"
                height={72}
                sx={{
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                }}
              />
            ) : dependencies.length > 0 ? (
              (() => {
                // Separar la app principal de las dependencias
                const mainAppDep = dependencies.find(
                  (dep) => dep.name === app.app_id,
                );
                const deps = dependencies.filter(
                  (dep) => dep.name !== app.app_id,
                );

                return (
                  <DependencyInfoPopover
                    appSize={mainAppDep?.download_size || "Unknown"}
                    dependencies={deps.map((dep) => ({
                      id: dep.name,
                      size: dep.download_size,
                    }))}
                    appId={app.app_id}
                  />
                );
              })()
            ) : null)}
        </Box>
      </Box>

      {/* Sección de Screenshots - Carrusel, Terminal o Resultado */}
      <Box sx={{ mb: 4 }}>
        {installStatus === "verifying" ? (
          // Security Verification UI
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              p: 4,
              minHeight: 500,
              bgcolor: "#161B22",
              borderRadius: 2,
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <Typography
              variant="h5"
              textAlign="center"
              sx={{
                color: "#C9D1D9",
                fontWeight: 500,
              }}
            >
              {t("appDetails.securityVerifyingSignatures")}
            </Typography>

            {/* Spinner */}
            <Box
              sx={{
                width: 60,
                height: 60,
                border: "3px solid rgba(74, 134, 207, 0.3)",
                borderTop: "3px solid #4A86CF",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
            />

            <Typography
              variant="body2"
              sx={{
                color: "#8B949E",
                fontFamily: "'Fira Code', 'Courier New', monospace",
              }}
            >
              {t("appDetails.securityCheckingSignatures")}
            </Typography>
          </Box>
        ) : installStatus === "verificationSuccess" ? (
          // Verification Success with Countdown
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              p: 4,
              minHeight: 500,
              bgcolor: "#161B22",
              borderRadius: 2,
              border: "1px solid rgba(39, 201, 63, 0.3)",
            }}
          >
            {/* Success Icon */}
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                bgcolor: "rgba(39, 201, 63, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #27c93f",
              }}
            >
              <Typography sx={{ color: "#27c93f", fontSize: "2rem" }}>
                ✓
              </Typography>
            </Box>

            <Typography
              variant="h5"
              textAlign="center"
              sx={{
                color: "#27c93f",
                fontWeight: 500,
              }}
            >
              {t("appDetails.securityVerificationSuccess")}
            </Typography>

            <Typography
              variant="body2"
              textAlign="center"
              sx={{
                color: "#8B949E",
                maxWidth: 500,
                px: 2,
              }}
            >
              {t("appDetails.securityHashVerifiedExplanation")}
            </Typography>

            <Typography
              variant="body1"
              textAlign="center"
              sx={{
                color: "#C9D1D9",
              }}
            >
              {t("appDetails.securityStartingInSeconds", { countdown })}
            </Typography>
          </Box>
        ) : installStatus === "verificationFailed" ||
          installStatus === "verificationUnsupported" ? (
          // Verification Failed UI
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              p: 4,
              minHeight: 500,
              bgcolor: "#161B22",
              borderRadius: 2,
              border: `1px solid ${
                verificationResult?.isUnsupportedPlatform
                  ? "rgba(246, 211, 45, 0.5)"
                  : verificationResult?.isHashMismatch
                    ? "rgba(255, 107, 107, 0.5)"
                    : "rgba(246, 211, 45, 0.5)"
              }`,
            }}
          >
            {/* Warning/Error Icon */}
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                bgcolor: verificationResult?.isUnsupportedPlatform
                  ? "rgba(246, 211, 45, 0.1)"
                  : verificationResult?.isHashMismatch
                    ? "rgba(255, 107, 107, 0.1)"
                    : "rgba(246, 211, 45, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `2px solid ${
                  verificationResult?.isUnsupportedPlatform
                    ? "#F6D32D"
                    : verificationResult?.isHashMismatch
                      ? "#FF6B6B"
                      : "#F6D32D"
                }`,
              }}
            >
              <Typography
                sx={{
                  color: verificationResult?.isUnsupportedPlatform
                    ? "#F6D32D"
                    : verificationResult?.isHashMismatch
                      ? "#FF6B6B"
                      : "#F6D32D",
                  fontSize: "2rem",
                }}
              >
                ⚠
              </Typography>
            </Box>

            <Typography
              variant="h5"
              textAlign="center"
              sx={{
                color: verificationResult?.isUnsupportedPlatform
                  ? "#F6D32D"
                  : verificationResult?.isHashMismatch
                    ? "#FF6B6B"
                    : "#F6D32D",
                fontWeight: 500,
              }}
            >
              {verificationResult?.isUnsupportedPlatform
                ? t("appDetails.securityUnsupportedPlatform")
                : t("appDetails.securityVerificationFailed")}
            </Typography>

            <Typography
              variant="body2"
              textAlign="center"
              sx={{
                color: "#8B949E",
                maxWidth: 500,
                px: 2,
                mb: 2,
              }}
            >
              {t("appDetails.securityHashVerificationExplanation")}
            </Typography>

            <Typography
              variant="body1"
              textAlign="center"
              sx={{
                color: "#C9D1D9",
                maxWidth: 600,
              }}
            >
              {verificationResult?.isUnsupportedPlatform
                ? t("appDetails.securityUnsupportedPlatformMessage")
                : verificationResult?.isHashMismatch
                  ? t("appDetails.securityHashMismatch")
                  : t("appDetails.securitySourceUnavailable")}
            </Typography>

            {/* Debug info - removed, now shown in More Details */}

            {/* Action Buttons */}
            <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
              <Button
                variant="outlined"
                onClick={handleShowVerificationDetails}
                sx={{
                  px: 3,
                  borderColor: "rgba(255, 255, 255, 0.3)",
                  color: "#C9D1D9",
                  "&:hover": {
                    borderColor: "rgba(255, 255, 255, 0.5)",
                    bgcolor: "rgba(255, 255, 255, 0.05)",
                  },
                }}
              >
                {t("appDetails.securityMoreDetails")}
              </Button>
              <Button
                variant="contained"
                onClick={handleForceContinue}
                disabled={
                  verificationResult?.isHashMismatch && riskCountdown !== null
                }
                sx={{
                  px: 3,
                  bgcolor: verificationResult?.isUnsupportedPlatform
                    ? "#F6D32D"
                    : verificationResult?.isHashMismatch
                      ? "#FF6B6B"
                      : "#F6D32D",
                  color: "#0D1117",
                  fontWeight: 600,
                  "&:hover": {
                    bgcolor: verificationResult?.isUnsupportedPlatform
                      ? "#f8db4e"
                      : verificationResult?.isHashMismatch
                        ? "#ff8585"
                        : "#f8db4e",
                  },
                  "&.Mui-disabled": {
                    bgcolor: verificationResult?.isHashMismatch
                      ? "rgba(255, 107, 107, 0.5)"
                      : "rgba(246, 211, 45, 0.5)",
                    color: "#0D1117",
                  },
                }}
              >
                {verificationResult?.isHashMismatch
                  ? riskCountdown !== null
                    ? `${t("appDetails.securityContinueAnywayRisk")} (${riskCountdown})`
                    : t("appDetails.securityContinueAnywayRisk")
                  : t("appDetails.securityContinueAnyway")}
              </Button>
            </Box>

            <Button
              onClick={handleCancelVerification}
              sx={{
                color: "#8B949E",
                "&:hover": {
                  color: "#C9D1D9",
                },
              }}
            >
              {t("appDetails.securityCancelInstallation")}
            </Button>
          </Box>
        ) : installStatus === "verificationDetails" ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              p: 4,
              minHeight: 500,
              bgcolor: "#161B22",
              borderRadius: 2,
              border: `1px solid ${
                verificationResult?.isUnsupportedPlatform
                  ? "rgba(246, 211, 45, 0.5)"
                  : verificationResult?.isHashMismatch
                    ? "rgba(255, 107, 107, 0.5)"
                    : "rgba(246, 211, 45, 0.5)"
              }`,
            }}
          >
            <Typography
              variant="h5"
              textAlign="center"
              sx={{
                color: "#C9D1D9",
                fontWeight: 500,
              }}
            >
              {t("appDetails.securityVerificationDetails") ||
                "Verification Details"}
            </Typography>

            <Box
              sx={{
                width: "100%",
                maxWidth: 600,
                maxHeight: 300,
                overflow: "auto",
                bgcolor: "rgba(0,0,0,0.3)",
                borderRadius: 1,
                p: 2,
                fontFamily: "'Fira Code', 'Courier New', monospace",
                fontSize: "0.85rem",
                color: "#8B949E",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {installOutput.map((line, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  {line}
                </div>
              ))}
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleDownloadLog}
                sx={{
                  px: 3,
                  borderColor: "rgba(255, 255, 255, 0.3)",
                  color: "#C9D1D9",
                  "&:hover": {
                    borderColor: "rgba(255, 255, 255, 0.5)",
                    bgcolor: "rgba(255, 255, 255, 0.05)",
                  },
                }}
              >
                {t("appDetails.saveLog") || "Save Log"}
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setInstallOutput([]);
                  setInstallStatus("verificationFailed");
                }}
                sx={{
                  px: 3,
                  bgcolor: "rgba(255, 255, 255, 0.1)",
                  color: "#C9D1D9",
                  borderColor: "rgba(255, 255, 255, 0.3)",
                  border: "1px solid",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.2)",
                  },
                }}
              >
                {t("appDetails.back") || "Back"}
              </Button>
            </Box>
          </Box>
        ) : installStatus === "installing" ? (
          <>
            <Typography variant="h6" gutterBottom textAlign="center">
              {t("appDetails.installationInProgress")}
            </Typography>
            <Terminal output={installOutput} isRunning={isInstalling} />
          </>
        ) : installStatus === "success" || installStatus === "error" ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              p: 4,
              minHeight: 500,
            }}
          >
            {/* Animación */}
            <Box sx={{ width: 300, height: 300 }}>
              <DotLottieReact
                key={installStatus}
                src={installStatus === "success" ? successAnim : errorAnim}
                loop={false}
                autoplay={true}
              />
            </Box>

            {/* Mensaje */}
            <Typography variant="h5" textAlign="center">
              {installStatus === "success"
                ? t("appDetails.installationCompleted")
                : t("appDetails.installationError")}
            </Typography>

            {/* Botones */}
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleDownloadLog}
                sx={{ px: 3 }}
              >
                {t("appDetails.getLog")}
              </Button>
              <Button variant="contained" onClick={handleAccept} sx={{ px: 3 }}>
                {t("appDetails.accept")}
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <Typography variant="h6" gutterBottom textAlign="center">
              {t("appDetails.screenshots")}
            </Typography>
            {isLoadingScreenshots ? (
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  maxWidth: 900,
                  margin: "0 auto",
                }}
              >
                <Skeleton
                  variant="rounded"
                  sx={{
                    width: "100%",
                    height: 500,
                  }}
                  animation="wave"
                />
              </Box>
            ) : screenshots && screenshots.length > 0 ? (
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  maxWidth: 900,
                  margin: "0 auto",
                }}
              >
                {/* Imagen actual */}
                <Box
                  sx={{
                    width: "100%",
                    height: 500,
                    bgcolor: "grey.900",
                    borderRadius: 2,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {screenshots.map((screenshot, index) => {
                    // Buscar el tamaño más grande o el primero disponible
                    const largestSize = screenshot.sizes.reduce(
                      (prev, current) =>
                        Number.parseInt(prev.width, 10) >
                        Number.parseInt(current.width, 10)
                          ? prev
                          : current,
                    );
                    return (
                      <Box
                        key={screenshotIds[index]}
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          display:
                            index === currentImageIndex ? "flex" : "none",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CachedImage
                          appId={app.app_id}
                          imageUrl={largestSize.src}
                          alt={`Screenshot ${index + 1}`}
                          cacheKey={`${app.app_id}:::${index + 1}`}
                          variant="rounded"
                          showErrorPlaceholder={false}
                          maxRetries={3}
                          style={{
                            width: "100%",
                            height: "100%",
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>

                {/* Controles del carrusel */}
                {screenshots.length > 1 && (
                  <>
                    <IconButton
                      onClick={handlePrevImage}
                      sx={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        bgcolor: "rgba(0, 0, 0, 0.5)",
                        color: "white",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.7)",
                        },
                      }}
                    >
                      <ChevronLeft />
                    </IconButton>
                    <IconButton
                      onClick={handleNextImage}
                      sx={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        bgcolor: "rgba(0, 0, 0, 0.5)",
                        color: "white",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.7)",
                        },
                      }}
                    >
                      <ChevronRight />
                    </IconButton>

                    {/* Indicadores */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 1,
                        mt: 2,
                      }}
                    >
                      {screenshots.map((_, index) => (
                        <Box
                          key={uuidv4()}
                          onClick={() => setCurrentImageIndex(index)}
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor:
                              index === currentImageIndex
                                ? "primary.main"
                                : "grey.600",
                            cursor: "pointer",
                            transition: "all 0.3s",
                            "&:hover": {
                              bgcolor:
                                index === currentImageIndex
                                  ? "primary.main"
                                  : "grey.500",
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  textAlign: "center",
                  py: 4,
                  color: "text.secondary",
                }}
              >
                <Typography>{t("appDetails.noScreenshots")}</Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Descripción */}
      {app.description && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            {t("appDetails.aboutThisApp")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {stripHtml(app.description)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
