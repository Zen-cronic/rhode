import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import { App } from "./App";
import { StandaloneCorridorReplay } from "./StandaloneCorridorReplay";
import { StandaloneDockEvidence } from "./StandaloneDockEvidence";
import "./style.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
const publicView = new URLSearchParams(window.location.search).get("view");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      {publicView === "matched-401" ? <StandaloneCorridorReplay /> : publicView === "dock-evidence" ? <StandaloneDockEvidence /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
);
