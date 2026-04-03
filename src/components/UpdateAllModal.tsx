import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "./Terminal";

export interface AppToVerify {
  appId: string;
  appName: string;
}

export interface VerificationDecision {
  appId: string;
  appName: string;
  status: "verified" | "warning" | "hashMismatch";
  decision: "include" | "exclude";
  error?: string;
}

interface UpdateAllModalProps {
  open: boolean;
  appsToVerify: AppToVerify[];
  onClose: () => void;
  onProceedWithUpdate: (appsToInclude: AppToVerify[]) => void;
  systemUpdatesCount: number;
  // Update phase props
  isUpdating?: boolean;
  updateOutput?: string[];
  showTerminal?: boolean;
  onToggleTerminal?: () => void;
  totalApps?: number;
  currentAppIndex?: number;
  currentAppName?: string;
  currentAppProgress?: number;
  isUpdatingSystem?: boolean;
  systemUpdateProgress?: number;
}

type VerificationState =
  | "idle"
  | "verifying"
  | "warning"
  | "hashMismatch"
  | "countdown"
  | "review";

export const UpdateAllModal = ({
  open,
  appsToVerify,
  onClose,
  onProceedWithUpdate,
  systemUpdatesCount,
  isUpdating = false,
  updateOutput = [],
  showTerminal = false,
  onToggleTerminal,
  totalApps = 0,
  currentAppIndex = 0,
  currentAppName = "",
  currentAppProgress = 0,
  isUpdatingSystem = false,
  systemUpdateProgress = 0,
}: UpdateAllModalProps) => {
  const { t } = useTranslation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [verificationState, setVerificationState] =
    useState<VerificationState>("idle");
  const [decisions, setDecisions] = useState<VerificationDecision[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [showDetails, setShowDetails] = useState(false);
  const [currentResult, setCurrentResult] = useState<{
    verified: boolean;
    isHashMismatch: boolean;
    isUnsupportedPlatform: boolean;
    error?: string;
  } | null>(null);
  const [fullCurrentResult, setFullCurrentResult] = useState<{
    sources: Array<{
      url: string;
      commit: string;
      verified: boolean;
      remote_commit?: string;
      error?: string;
      platform?: string;
    }>;
    error?: string;
  } | null>(null);

  const cancelledRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open && appsToVerify.length > 0) {
      setCurrentIndex(0);
      setVerificationState("verifying");
      setDecisions([]);
      setCountdown(3);
      setCurrentResult(null);
      setFullCurrentResult(null);
      setShowDetails(false);
      cancelledRef.current = false;
    }
  }, [open, appsToVerify.length]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const classifyResult = useCallback(
    (raw: {
      verified: boolean;
      sources: Array<{ error?: string; platform?: string }>;
      error?: string;
    }) => {
      const errorMsg = raw.sources[0]?.error || raw.error || "";
      const platform = raw.sources[0]?.platform || "unknown";
      const isUnsupportedPlatform = platform === "unsupported";
      const isHashMismatch =
        errorMsg.toLowerCase().includes("hash mismatch") ||
        errorMsg.toLowerCase().includes("mismatch");
      return {
        verified: raw.verified,
        isHashMismatch,
        isUnsupportedPlatform,
        error: raw.error,
      };
    },
    [],
  );

  const handleShowDetails = useCallback(() => setShowDetails(true), []);
  const handleHideDetails = useCallback(() => setShowDetails(false), []);

  const verifyCurrentApp = useCallback(async () => {
    if (currentIndex >= appsToVerify.length) {
      const allVerified = decisions.every((d) => d.status === "verified");
      if (allVerified && decisions.length === appsToVerify.length) {
        setVerificationState("countdown");
        setCountdown(3);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              onProceedWithUpdate(appsToVerify);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setVerificationState("review");
      }
      return;
    }

    const app = appsToVerify[currentIndex];
    setVerificationState("verifying");

    try {
      const raw = await invoke<{
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
      }>("verify_app_hash", { appId: app.appId });

      const result = classifyResult(raw);
      setCurrentResult(result);
      setFullCurrentResult({ sources: raw.sources, error: raw.error });

      if (result.verified) {
        setDecisions((prev) => [
          ...prev,
          {
            appId: app.appId,
            appName: app.appName,
            status: "verified",
            decision: "include",
          },
        ]);
        setCurrentIndex((prev) => prev + 1);
      } else if (result.isHashMismatch) {
        // Confirmed hash mismatch → red/critical
        setVerificationState("hashMismatch");
      } else {
        // Cannot verify (unsupported, source unavailable, network error) → yellow/warning
        setVerificationState("warning");
      }
    } catch (error) {
      setCurrentResult({
        verified: false,
        isHashMismatch: false,
        isUnsupportedPlatform: false,
        error: String(error),
      });
      setFullCurrentResult({ sources: [], error: String(error) });
      setVerificationState("warning");
    }
  }, [
    currentIndex,
    appsToVerify,
    classifyResult,
    decisions,
    onProceedWithUpdate,
  ]);

  useEffect(() => {
    if (open && verificationState === "verifying") {
      verifyCurrentApp();
    }
  }, [open, verificationState, verifyCurrentApp]);

  const handleInclude = useCallback(() => {
    const app = appsToVerify[currentIndex];
    setDecisions((prev) => [
      ...prev,
      {
        appId: app.appId,
        appName: app.appName,
        status: verificationState as "warning" | "hashMismatch",
        decision: "include",
        error: currentResult?.error,
      },
    ]);
    setCurrentIndex((prev) => prev + 1);
    setShowDetails(false);
    setVerificationState("verifying");
  }, [currentIndex, appsToVerify, verificationState, currentResult]);

  const handleExclude = useCallback(() => {
    const app = appsToVerify[currentIndex];
    setDecisions((prev) => [
      ...prev,
      {
        appId: app.appId,
        appName: app.appName,
        status: verificationState as "warning" | "hashMismatch",
        decision: "exclude",
        error: currentResult?.error,
      },
    ]);
    setCurrentIndex((prev) => prev + 1);
    setShowDetails(false);
    setVerificationState("verifying");
  }, [currentIndex, appsToVerify, verificationState, currentResult]);

  const handleCancelAll = useCallback(() => {
    cancelledRef.current = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
    onClose();
  }, [onClose]);

  const handleProceedFromReview = useCallback(() => {
    const appsToInclude = decisions
      .filter((d) => d.decision === "include")
      .map((d) => ({ appId: d.appId, appName: d.appName }));
    if (appsToInclude.length > 0) {
      onProceedWithUpdate(appsToInclude);
    } else {
      onClose();
    }
  }, [decisions, onProceedWithUpdate, onClose]);

  const verifiedCount = decisions.filter((d) => d.status === "verified").length;
  const warningCount = decisions.filter((d) => d.status === "warning").length;
  const hashMismatchCount = decisions.filter(
    (d) => d.status === "hashMismatch",
  ).length;
  const pendingCount = appsToVerify.length - decisions.length;
  const includedCount = decisions.filter(
    (d) => d.decision === "include",
  ).length;
  const currentApp = appsToVerify[currentIndex];
  const progressPercent =
    appsToVerify.length > 0
      ? (decisions.length / appsToVerify.length) * 100
      : 0;

  if (!open) return null;

  // Update phase
  if (isUpdating) {
    const totalItems = totalApps + (systemUpdatesCount > 0 ? 1 : 0);
    const overallProgress =
      totalItems > 0 ? (currentAppIndex / totalItems) * 100 : 0;
    const displayProgress = isUpdatingSystem
      ? systemUpdateProgress
      : currentAppProgress;
    const displayName = isUpdatingSystem
      ? t("myApps.systemAndRuntimeUpdates")
      : currentAppName || t("myApps.waiting");

    return (
      <Dialog
        open={open}
        onClose={!isUpdating ? onClose : undefined}
        maxWidth="md"
        fullWidth
      >
        <DialogContent>
          <Typography variant="h6" gutterBottom>
            {t("myApps.updatingAllApps")}
          </Typography>
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                {t("myApps.overallProgress")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {currentAppIndex} / {totalItems}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={overallProgress}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                {t("myApps.currentApp")}
              </Typography>
              <Typography
                variant="body2"
                color="primary"
                sx={{ fontWeight: "bold" }}
              >
                {displayName}
              </Typography>
            </Box>
            <LinearProgress
              variant={displayProgress >= 0 ? "determinate" : "indeterminate"}
              value={displayProgress}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            {onToggleTerminal && (
              <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onToggleTerminal}
                  sx={{ borderColor: "divider", color: "text.secondary" }}
                >
                  {showTerminal
                    ? t("myApps.hideDetails")
                    : t("myApps.showDetails")}
                </Button>
              </Box>
            )}
            {showTerminal && updateOutput.length > 0 && (
              <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                <Terminal output={updateOutput} isRunning={isUpdating} />
              </Box>
            )}
            {!showTerminal && updateOutput.length > 0 && (
              <Box
                sx={{
                  maxHeight: 100,
                  overflow: "hidden",
                  filter: "blur(2px)",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              >
                <Terminal output={updateOutput} isRunning={isUpdating} />
              </Box>
            )}
          </Box>
          {!isUpdating && (
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
              <Button variant="contained" onClick={onClose}>
                {t("myApps.closeButton")}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Verification phase
  return (
    <Dialog
      open={open}
      onClose={
        verificationState !== "verifying" && verificationState !== "countdown"
          ? onClose
          : undefined
      }
      maxWidth="sm"
      fullWidth
    >
      <DialogContent sx={{ p: 3 }}>
        <Typography
          variant="subtitle1"
          sx={{ color: "#C9D1D9", fontWeight: 600, mb: 2 }}
        >
          {verificationState === "countdown"
            ? t("appDetails.securityVerificationSuccess")
            : verificationState === "review"
              ? t("appDetails.securityVerificationDetails")
              : t("appDetails.verifyingSecurity")}
        </Typography>

        {/* Progress */}
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}
          >
            <Typography variant="caption" sx={{ color: "#8B949E" }}>
              {t("appDetails.securityVerificationSourcesChecked")}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "#8B949E", fontFamily: "monospace" }}
            >
              {decisions.length} / {appsToVerify.length}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 4,
              borderRadius: 1,
              bgcolor: "rgba(255, 255, 255, 0.05)",
              "& .MuiLinearProgress-bar": {
                bgcolor:
                  hashMismatchCount > 0
                    ? "#FF6B6B"
                    : warningCount > 0
                      ? "#F6D32D"
                      : "#27c93f",
              },
            }}
          />
        </Box>

        {/* Summary chips */}
        {decisions.length > 0 && (
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              justifyContent: "center",
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            {verifiedCount > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "rgba(39, 201, 63, 0.1)",
                  border: "1px solid rgba(39, 201, 63, 0.3)",
                }}
              >
                <Typography sx={{ color: "#27c93f", fontSize: "0.9rem" }}>
                  ✓
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "#27c93f", fontWeight: 600 }}
                >
                  {verifiedCount}
                </Typography>
              </Box>
            )}
            {warningCount > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "rgba(246, 211, 45, 0.1)",
                  border: "1px solid rgba(246, 211, 45, 0.3)",
                }}
              >
                <Typography sx={{ color: "#F6D32D", fontSize: "0.9rem" }}>
                  ⚠
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "#F6D32D", fontWeight: 600 }}
                >
                  {warningCount}
                </Typography>
              </Box>
            )}
            {hashMismatchCount > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "rgba(255, 107, 107, 0.1)",
                  border: "1px solid rgba(255, 107, 107, 0.3)",
                }}
              >
                <Typography sx={{ color: "#FF6B6B", fontSize: "0.9rem" }}>
                  ✗
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "#FF6B6B", fontWeight: 600 }}
                >
                  {hashMismatchCount}
                </Typography>
              </Box>
            )}
            {pendingCount > 0 && verificationState !== "review" && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "#8B949E", fontWeight: 600 }}
                >
                  {pendingCount} pending
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Verifying */}
        {verificationState === "verifying" && currentApp && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              p: 2.5,
              bgcolor: "rgba(255, 255, 255, 0.02)",
              borderRadius: 2,
              border: "1px solid rgba(88, 166, 255, 0.3)",
              mb: 2,
            }}
          >
            <CircularProgress size={28} sx={{ color: "#58A6FF" }} />
            <Typography
              variant="body2"
              sx={{ color: "#C9D1D9", fontWeight: 500 }}
            >
              {currentApp.appName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#6E7681",
                fontFamily: "monospace",
                fontSize: "0.7rem",
              }}
            >
              {currentApp.appId}
            </Typography>
          </Box>
        )}

        {/* Unsupported decision */}
        {verificationState === "warning" && currentApp && !showDetails && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              bgcolor: "rgba(255, 255, 255, 0.02)",
              borderRadius: 2,
              border: "1px solid rgba(246, 211, 45, 0.5)",
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  bgcolor: "rgba(246, 211, 45, 0.1)",
                  border: "2px solid #F6D32D",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ color: "#F6D32D", fontSize: "1.1rem" }}>
                  ⚠
                </Typography>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ color: "#F6D32D", fontWeight: 600 }}
                >
                  {currentApp.appName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "#8B949E",
                    fontFamily: "monospace",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentApp.appId}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: "#8B949E" }}>
              {t("myApps.verificationWarningMessage")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleExclude}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationSkipApp")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleShowDetails}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationMoreDetails")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleInclude}
                sx={{
                  flex: 1,
                  bgcolor: "#F6D32D",
                  color: "#0D1117",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "#f8db4e" },
                }}
              >
                {t("myApps.verificationIncludeApp")}
              </Button>
            </Box>
          </Box>
        )}

        {/* Unsupported details */}
        {verificationState === "warning" && currentApp && showDetails && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              bgcolor: "rgba(0, 0, 0, 0.2)",
              borderRadius: 2,
              border: "1px solid rgba(246, 211, 45, 0.5)",
              mb: 2,
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "#C9D1D9", fontWeight: 600 }}
            >
              {t("appDetails.securityVerificationDetails")}
            </Typography>
            <Box
              sx={{
                maxHeight: 180,
                overflow: "auto",
                bgcolor: "rgba(0, 0, 0, 0.3)",
                borderRadius: 1,
                p: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.75rem",
                color: "#8B949E",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {fullCurrentResult && (
                <>
                  <div style={{ color: "#F6D32D", marginBottom: 6 }}>
                    {t("appDetails.securityVerificationOverallStatus")}: ⚠{" "}
                    {t("appDetails.securitySourceUnavailable")}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    {t("appDetails.securityVerificationSourcesChecked")}:
                  </div>
                  {fullCurrentResult.sources.map((s, i) => (
                    <div key={i} style={{ marginBottom: 4, paddingLeft: 6 }}>
                      [{s.verified ? "✓" : "✗"}] {s.url}
                      <br />
                      <span style={{ color: "#6E7681" }}>
                        {t("appDetails.securityVerificationCommitInManifest")}:{" "}
                        {s.commit || "N/A"}
                      </span>
                      {s.remote_commit && (
                        <>
                          <br />
                          <span style={{ color: "#6E7681" }}>
                            {t("appDetails.securityVerificationRemoteCommit")}:{" "}
                            {s.remote_commit}
                          </span>
                        </>
                      )}
                      {s.error && (
                        <>
                          <br />
                          <span style={{ color: "#FF6B6B" }}>
                            {t("appDetails.securityVerificationError")}:{" "}
                            {s.error}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {fullCurrentResult.error && (
                    <div style={{ marginTop: 6, color: "#FF6B6B" }}>
                      {t("appDetails.securityVerificationError")}:{" "}
                      {fullCurrentResult.error}
                    </div>
                  )}
                </>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleExclude}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationSkipApp")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleHideDetails}
                sx={{
                  flex: 1,
                  bgcolor: "rgba(255, 255, 255, 0.1)",
                  color: "#C9D1D9",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.15)" },
                }}
              >
                {t("myApps.hideDetails")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleInclude}
                sx={{
                  flex: 1,
                  bgcolor: "#F6D32D",
                  color: "#0D1117",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "#f8db4e" },
                }}
              >
                {t("myApps.verificationIncludeApp")}
              </Button>
            </Box>
          </Box>
        )}

        {/* Failed decision */}
        {verificationState === "hashMismatch" && currentApp && !showDetails && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              bgcolor: "rgba(255, 255, 255, 0.02)",
              borderRadius: 2,
              border: "1px solid rgba(255, 107, 107, 0.5)",
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  bgcolor: "rgba(255, 107, 107, 0.1)",
                  border: "2px solid #FF6B6B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ color: "#FF6B6B", fontSize: "1.1rem" }}>
                  ✗
                </Typography>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ color: "#FF6B6B", fontWeight: 600 }}
                >
                  {currentApp.appName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "#8B949E",
                    fontFamily: "monospace",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentApp.appId}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: "#C9D1D9" }}>
              {currentResult?.isHashMismatch
                ? t("appDetails.securityHashMismatch")
                : t("appDetails.securitySourceUnavailable")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleExclude}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationSkipApp")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleShowDetails}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationMoreDetails")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleInclude}
                sx={{
                  flex: 1,
                  bgcolor: "#FF6B6B",
                  color: "#0D1117",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "#ff8585" },
                }}
              >
                {t("myApps.verificationForceApp")}
              </Button>
            </Box>
          </Box>
        )}

        {/* Failed details */}
        {verificationState === "hashMismatch" && currentApp && showDetails && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              bgcolor: "rgba(0, 0, 0, 0.2)",
              borderRadius: 2,
              border: "1px solid rgba(255, 107, 107, 0.5)",
              mb: 2,
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "#C9D1D9", fontWeight: 600 }}
            >
              {t("appDetails.securityVerificationDetails")}
            </Typography>
            <Box
              sx={{
                maxHeight: 180,
                overflow: "auto",
                bgcolor: "rgba(0, 0, 0, 0.3)",
                borderRadius: 1,
                p: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.75rem",
                color: "#8B949E",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {fullCurrentResult && (
                <>
                  <div style={{ color: "#FF6B6B", marginBottom: 6 }}>
                    {t("appDetails.securityVerificationOverallStatus")}: ✗{" "}
                    {t("appDetails.securityVerificationFailed")}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    {t("appDetails.securityVerificationSourcesChecked")}:
                  </div>
                  {fullCurrentResult.sources.map((s, i) => (
                    <div key={i} style={{ marginBottom: 4, paddingLeft: 6 }}>
                      [{s.verified ? "✓" : "✗"}] {s.url}
                      <br />
                      <span style={{ color: "#6E7681" }}>
                        {t("appDetails.securityVerificationCommitInManifest")}:{" "}
                        {s.commit || "N/A"}
                      </span>
                      {s.remote_commit && (
                        <>
                          <br />
                          <span style={{ color: "#6E7681" }}>
                            {t("appDetails.securityVerificationRemoteCommit")}:{" "}
                            {s.remote_commit}
                          </span>
                        </>
                      )}
                      {s.error && (
                        <>
                          <br />
                          <span style={{ color: "#FF6B6B" }}>
                            {t("appDetails.securityVerificationError")}:{" "}
                            {s.error}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {fullCurrentResult.error && (
                    <div style={{ marginTop: 6, color: "#FF6B6B" }}>
                      {t("appDetails.securityVerificationError")}:{" "}
                      {fullCurrentResult.error}
                    </div>
                  )}
                </>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleExclude}
                sx={{
                  flex: 1,
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationSkipApp")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleHideDetails}
                sx={{
                  flex: 1,
                  bgcolor: "rgba(255, 255, 255, 0.1)",
                  color: "#C9D1D9",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.15)" },
                }}
              >
                {t("myApps.hideDetails")}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleInclude}
                sx={{
                  flex: 1,
                  bgcolor: "#FF6B6B",
                  color: "#0D1117",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                  "&:hover": { bgcolor: "#ff8585" },
                }}
              >
                {t("myApps.verificationForceApp")}
              </Button>
            </Box>
          </Box>
        )}

        {/* Countdown */}
        {verificationState === "countdown" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              p: 3,
              bgcolor: "rgba(255, 255, 255, 0.02)",
              borderRadius: 2,
              border: "1px solid rgba(39, 201, 63, 0.3)",
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
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
              variant="body1"
              sx={{ color: "#27c93f", fontWeight: 600 }}
            >
              {t("appDetails.securityVerificationSuccess")}
            </Typography>
            <Typography variant="caption" sx={{ color: "#8B949E" }}>
              {t("appDetails.securityHashVerifiedExplanation")}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "#C9D1D9", fontFamily: "monospace" }}
            >
              {t("appDetails.securityStartingInSeconds", { countdown })}
            </Typography>
          </Box>
        )}

        {/* Review */}
        {verificationState === "review" && (
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}
          >
            <Typography variant="caption" sx={{ color: "#8B949E" }}>
              {includedCount + (decisions.length - includedCount) === 0
                ? "No apps passed verification"
                : `${includedCount} app(s) will be updated, ${decisions.length - includedCount} excluded`}
            </Typography>
            <Box
              sx={{
                maxHeight: 200,
                overflow: "auto",
                bgcolor: "rgba(0, 0, 0, 0.2)",
                borderRadius: 1,
                p: 1.5,
              }}
            >
              {decisions.map((d, i) => (
                <Box
                  key={d.appId}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 0.75,
                    borderBottom:
                      i < decisions.length - 1
                        ? "1px solid rgba(255, 255, 255, 0.05)"
                        : "none",
                    opacity: d.decision === "exclude" ? 0.5 : 1,
                  }}
                >
                  <Typography
                    sx={{ fontSize: "0.9rem", width: 20, textAlign: "center" }}
                  >
                    {d.status === "verified"
                      ? "✓"
                      : d.status === "warning"
                        ? "⚠"
                        : "✗"}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: d.decision === "include" ? "#C9D1D9" : "#8B949E",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {d.appName}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#6E7681",
                        fontFamily: "monospace",
                        fontSize: "0.65rem",
                        display: "block",
                      }}
                    >
                      {d.appId}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: d.decision === "include" ? "#27c93f" : "#FF6B6B",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      fontSize: "0.6rem",
                    }}
                  >
                    {d.decision === "include" ? "Include" : "Skip"}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* System updates note */}
        {systemUpdatesCount > 0 && verificationState !== "verifying" && (
          <Typography
            variant="caption"
            sx={{ color: "#6E7681", display: "block", mb: 2 }}
          >
            + {systemUpdatesCount} system package(s) will also be updated
          </Typography>
        )}

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
          {verificationState === "review" ? (
            <>
              <Button
                size="small"
                variant="outlined"
                onClick={handleCancelAll}
                sx={{
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#8B949E",
                  fontSize: "0.75rem",
                  py: 0.5,
                  textTransform: "none",
                }}
              >
                {t("myApps.verificationCancelAll")}
              </Button>
              {includedCount > 0 && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleProceedFromReview}
                  sx={{
                    bgcolor: "#27c93f",
                    color: "#0D1117",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    py: 0.5,
                    textTransform: "none",
                    "&:hover": { bgcolor: "#2ed547" },
                  }}
                >
                  Update {includedCount} app(s)
                </Button>
              )}
            </>
          ) : verificationState === "countdown" ? (
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelAll}
              sx={{
                borderColor: "rgba(255, 255, 255, 0.2)",
                color: "#8B949E",
                fontSize: "0.75rem",
                py: 0.5,
                textTransform: "none",
              }}
            >
              {t("myApps.verificationCancelAll")}
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelAll}
              disabled={verificationState === "verifying"}
              sx={{
                borderColor: "rgba(255, 255, 255, 0.2)",
                color: "#8B949E",
                fontSize: "0.75rem",
                py: 0.5,
                textTransform: "none",
                "&.Mui-disabled": {
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  color: "rgba(255, 255, 255, 0.3)",
                },
              }}
            >
              {t("myApps.verificationCancelAll")}
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};
