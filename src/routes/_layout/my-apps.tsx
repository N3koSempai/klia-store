import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import type { CategoryApp } from "../../types";

const MyApps = lazy(() =>
  import("../../pages/myApps/MyApps").then((m) => ({
    default: m.MyApps,
  })),
);

export const Route = createFileRoute("/_layout/my-apps")({
  component: MyAppsRoute,
});

function MyAppsRoute() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate({ to: "/" });
  };

  const handleDeveloperSelect = (
    developerId: string,
    developerName: string,
    appId: string,
  ) => {
    navigate({
      to: "/developer/$developerId",
      params: { developerId },
      search: { developerName, developerAppId: appId },
    });
  };

  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
          }}
        >
          <CircularProgress />
        </Box>
      }
    >
      <MyApps onBack={handleBack} onDeveloperSelect={handleDeveloperSelect} />
    </Suspense>
  );
}
