import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiService } from "../services/api";
import type { AppStream } from "../types";

interface Release {
  timestamp: string;
  version: string;
  description: string;
  url?: string;
}

interface ReleaseNotesModalProps {
  appId: string;
  appName: string;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  open: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal = ({
  appId,
  appName,
  currentVersion,
  newVersion,
  changelog,
  open,
  onClose,
}: ReleaseNotesModalProps) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const loadReleaseNotes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Si hay changelog disponible, usarlo directamente
        if (changelog) {
          setReleases([
            {
              timestamp: String(Math.floor(Date.now() / 1000)),
              version: newVersion,
              description: changelog,
            },
          ]);
          setIsLoading(false);
          return;
        }

        // Si no hay changelog, intentar cargar desde la API
        const appStream: AppStream = await apiService.getAppStream(appId);

        if (appStream.releases && appStream.releases.length > 0) {
          // Get the latest release
          const latestRelease = appStream.releases[0];
          setReleases([latestRelease]);
        } else {
          setReleases([]);
        }
      } catch (err) {
        console.error("Error loading release notes:", err);
        setError(t("releaseNotes.errorLoading"));
      } finally {
        setIsLoading(false);
      }
    };

    loadReleaseNotes();
  }, [appId, open, changelog, newVersion]);

  // Función para limpiar HTML de la descripción
  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6" component="div">
            {appName} - {t("releaseNotes.title")}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box>
            <Skeleton variant="text" width="40%" height={30} sx={{ mb: 2 }} />
            <Skeleton variant="rectangular" height={100} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={100} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={100} />
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        ) : releases.length > 0 ? (
          <Box>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t("releaseNotes.currentVersion")}{" "}
                <strong>v{currentVersion}</strong>
              </Typography>
              <Typography
                variant="body2"
                color="primary"
                sx={{ fontWeight: "bold" }}
              >
                {t("releaseNotes.newVersionAvailable")}{" "}
                <strong>v{newVersion}</strong>
              </Typography>
            </Box>

            {releases.map((release) => (
              <Box key={release.version} sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t("releaseNotes.version", { version: release.version })}
                </Typography>
                {release.timestamp && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 2, display: "block" }}
                  >
                    {new Date(
                      Number.parseInt(release.timestamp) * 1000,
                    ).toLocaleDateString()}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "pre-wrap",
                    "& ul": {
                      pl: 2,
                    },
                    "& li": {
                      mb: 0.5,
                    },
                  }}
                >
                  {stripHtml(release.description)}
                </Typography>
                {release.url && (
                  <Box sx={{ mt: 2 }}>
                    <Typography
                      component="a"
                      href={release.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: "primary.main",
                        textDecoration: "none",
                        "&:hover": {
                          textDecoration: "underline",
                        },
                      }}
                    >
                      {t("releaseNotes.moreInfo")}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">
              {t("releaseNotes.noNotes")}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
