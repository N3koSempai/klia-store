import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { QueryClient } from "@tanstack/react-query";
import { theme } from "../theme/theme";
import "../i18n/config";
import "../App.css";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Outlet />
    </ThemeProvider>
  );
}
