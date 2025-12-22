import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Popover,
  Box,
  Typography,
  Divider,
  Stack,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

interface Dependency {
  id: string;
  size: string;
}

interface ProcessedDependency extends Dependency {
  localeSize?: string; // Size of associated .Locale package
}

interface DependencyInfoPopoverProps {
  appSize: string;
  dependencies: Dependency[];
  appId: string; // App ID to determine core .Locale package
}

export function DependencyInfoPopover({
  appSize,
  dependencies,
  appId,
}: DependencyInfoPopoverProps) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  // Process dependencies to separate .Locale packages
  const processDependencies = (): {
    coreLocaleSize: string | null;
    processedDeps: ProcessedDependency[];
  } => {
    const coreLocaleName = `${appId}.Locale`;
    let coreLocaleSize: string | null = null;
    const depsMap = new Map<string, ProcessedDependency>();
    const localeMap = new Map<string, string>(); // Map of base package name to locale size

    // First pass: collect all .Locale packages
    for (const dep of dependencies) {
      if (dep.id.endsWith(".Locale")) {
        const baseName = dep.id.slice(0, -7); // Remove ".Locale"

        // Check if this is the core app's .Locale package
        if (dep.id === coreLocaleName) {
          coreLocaleSize = dep.size;
        } else {
          // Store locale for matching with dependency later
          localeMap.set(baseName, dep.size);
        }
      }
    }

    // Second pass: process all non-.Locale packages and match with their locales
    for (const dep of dependencies) {
      // Skip all .Locale packages (already processed)
      if (dep.id.endsWith(".Locale")) {
        continue;
      }

      // Regular dependency - check if it has a matching .Locale
      const localeSize = localeMap.get(dep.id);
      depsMap.set(dep.id, {
        id: dep.id,
        size: dep.size,
        localeSize: localeSize || undefined
      });
    }

    return {
      coreLocaleSize,
      processedDeps: Array.from(depsMap.values()),
    };
  };

  const { coreLocaleSize, processedDeps } = processDependencies();

  // Calculate total size
  const parseSize = (size: string): number => {
    // Handle "Unknown" case
    if (size === "Unknown" || size === "unknown") return 0;

    // Handle comma as decimal separator (e.g., "2,1 MB" -> "2.1 MB")
    const normalizedSize = size.replace(",", ".");
    const match = normalizedSize.match(/([\d.]+)\s*(MB|GB|kB|KB|B)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "GB") return value * 1024;
    if (unit === "KB" || unit === "kB") return value / 1024;
    if (unit === "B") return value / (1024 * 1024);
    return value; // MB
  };

  const appSizeMB = parseSize(appSize);
  const coreLocaleSizeMB = coreLocaleSize ? parseSize(coreLocaleSize) : 0;
  const depsSizeMB = processedDeps.reduce(
    (sum, dep) => {
      const mainSize = parseSize(dep.size);
      const localeSize = dep.localeSize ? parseSize(dep.localeSize) : 0;
      return sum + mainSize + localeSize;
    },
    0,
  );
  const totalSizeMB = appSizeMB + coreLocaleSizeMB + depsSizeMB;
  const hasUnknownSize =
    appSize === "Unknown" ||
    (coreLocaleSize && coreLocaleSize === "Unknown") ||
    processedDeps.some((dep) => dep.size === "Unknown" || dep.localeSize === "Unknown");

  const formatSize = (mb: number, originalSize?: string): string => {
    if (originalSize === "Unknown") return t("common.unknown");
    if (mb === 0 && hasUnknownSize) return t("common.unknown");
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb < 1 && mb > 0) return `${(mb * 1024).toFixed(0)} kB`;
    return `${mb.toFixed(1)} MB`;
  };

  const hasDependencies = processedDeps.length > 0;

  // Visual state based on dependencies
  const borderColor = hasDependencies ? "warning.main" : "success.main";
  const accentColor = hasDependencies ? "#F6D32D" : "#4CAF50";
  const statusIcon = hasDependencies ? (
    <WarningAmberIcon sx={{ fontSize: "1rem", color: accentColor }} />
  ) : (
    <CheckCircleOutlineIcon sx={{ fontSize: "1rem", color: accentColor }} />
  );
  const statusText = hasDependencies
    ? `${processedDeps.length} ${processedDeps.length > 1 ? t("dependency.dependenciesRequired") : t("dependency.dependencyRequired")}`
    : t("dependency.noDependenciesRequired");

  return (
    <>
      <Button
        variant="outlined"
        fullWidth
        onClick={handleClick}
        sx={{
          borderColor,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          py: 1.5,
          px: 2,
          textTransform: "none",
          gap: 0.5,
          "&:hover": {
            borderColor,
            backgroundColor: hasDependencies
              ? "rgba(246, 211, 45, 0.05)"
              : "rgba(76, 175, 80, 0.05)",
          },
        }}
      >
        {/* Line 1: Download Size */}
        <Typography
          sx={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "text.primary",
            width: "100%",
          }}
        >
          {t("dependency.downloadSize")}:{" "}
          {hasUnknownSize ? t("common.unknown") : formatSize(totalSizeMB)}
        </Typography>

        {/* Line 2: Status */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            width: "100%",
          }}
        >
          {statusIcon}
          <Typography
            sx={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.75rem",
              color: accentColor,
              fontWeight: 500,
            }}
          >
            {statusText}
          </Typography>
        </Box>
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        elevation={8}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#161B22",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 2,
              minWidth: 360,
              maxWidth: 450,
              p: 3,
              mt: 1,
            },
          },
        }}
      >
        <Stack spacing={2.5}>
          {/* Header */}
          <Typography
            sx={{
              fontFamily: "Inter, sans-serif",
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: -0.5,
            }}
          >
            {t("dependency.storageBreakdown")}
          </Typography>

          {/* Summary Section */}
          <Box>
            {/* Total Download - Big Number */}
            <Box sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.6)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  mb: 0.5,
                }}
              >
                {t("dependency.totalDownload")}
              </Typography>
              <Typography
                sx={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "2rem",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  lineHeight: 1,
                }}
              >
                {hasUnknownSize ? t("common.unknown") : formatSize(totalSizeMB)}
              </Typography>
            </Box>

            {/* App Core Size */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                py: 1,
              }}
            >
              <Typography
                sx={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: 500,
                }}
              >
                {t("dependency.appCoreSize")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <Typography
                  sx={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.9)",
                    fontWeight: 600,
                  }}
                >
                  {formatSize(appSizeMB, appSize)}
                </Typography>
                {coreLocaleSize && (
                  <Typography
                    sx={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "0.6875rem",
                      color: "rgba(255,255,255,0.5)",
                      fontWeight: 500,
                      mt: 0.25,
                    }}
                  >
                    + {formatSize(coreLocaleSizeMB, coreLocaleSize)} ({t("dependency.locale")})
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>

          {/* Dependencies Section */}
          {hasDependencies && (
            <Box>
              <Divider
                sx={{
                  borderColor: "rgba(255,255,255,0.15)",
                  my: 1,
                }}
              />

              <Typography
                sx={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.6)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  mb: 1.5,
                  mt: 1,
                }}
              >
                {t("dependency.dependencies")}
              </Typography>

              <Stack spacing={1}>
                {processedDeps.map((dep, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 2,
                      py: 0.75,
                      borderBottom:
                        index < processedDeps.length - 1
                          ? "1px solid rgba(255,255,255,0.05)"
                          : "none",
                    }}
                  >
                    <Typography
                      sx={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "0.75rem",
                        color: "rgba(255,255,255,0.7)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {dep.id}
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <Typography
                        sx={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "0.8125rem",
                          color: "rgba(255,255,255,0.9)",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {formatSize(parseSize(dep.size), dep.size)}
                      </Typography>
                      {dep.localeSize && (
                        <Typography
                          sx={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "0.6875rem",
                            color: "rgba(255,255,255,0.5)",
                            fontWeight: 500,
                            mt: 0.25,
                          }}
                        >
                          + {formatSize(parseSize(dep.localeSize), dep.localeSize)} ({t("dependency.locale")})
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Stack>

              {/* Footer Note */}
              <Box
                sx={{
                  mt: 2.5,
                  pt: 2,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.6875rem",
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.5,
                    fontStyle: "italic",
                  }}
                >
                  {t("dependency.sharedRuntimesNote")}
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </Popover>
    </>
  );
}
