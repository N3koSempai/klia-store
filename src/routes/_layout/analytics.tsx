import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";

const Analytics = lazy(() =>
  import("../../pages/analytics/Analytics").then((m) => ({
    default: m.Analytics,
  })),
);

export const Route = createFileRoute("/_layout/analytics")({
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate({ to: "/" });
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
      <Analytics onBack={handleBack} />
    </Suspense>
  );
}
