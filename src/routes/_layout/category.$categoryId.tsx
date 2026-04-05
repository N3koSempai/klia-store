import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import type { CategoryApp } from "../../types";

const CategoryApps = lazy(() =>
  import("../../pages/categoryApps/CategoryApps").then((m) => ({
    default: m.CategoryApps,
  })),
);

export const Route = createFileRoute("/_layout/category/$categoryId")({
  component: CategoryRoute,
});

function CategoryRoute() {
  const { categoryId } = Route.useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate({ to: "/" });
  };

  const handleAppSelect = (
    app: CategoryApp,
    searchQuery?: string,
    searchResults?: CategoryApp[],
  ) => {
    navigate({
      to: "/app/$appId",
      params: { appId: app.app_id },
      search: { searchQuery, searchResults },
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
      <CategoryApps
        categoryId={categoryId}
        onBack={handleBack}
        onAppSelect={handleAppSelect}
      />
    </Suspense>
  );
}
