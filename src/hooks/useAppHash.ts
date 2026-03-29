import { useEffect, useCallback } from "react";
import type { ViewMode } from "../types";

export type AppSection = "graph" | "library";

interface UseAppHashArgs {
  appSection: AppSection;
  setAppSection: (s: AppSection) => void;
  view: ViewMode;
  selectedNodeId: number | null;
  setView: (v: ViewMode) => void;
  setSelectedNodeId: (id: number | null) => void;
  libraryRowId: string | null;
  setLibraryRowId: (id: string | null) => void;
}

function parseHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function useAppHash({
  appSection,
  setAppSection,
  view,
  selectedNodeId,
  setView,
  setSelectedNodeId,
  libraryRowId,
  setLibraryRowId,
}: UseAppHashArgs) {
  useEffect(() => {
    const params = parseHash();
    if ([...params.keys()].length === 0) return;

    const page = params.get("page");
    if (page === "library") {
      setAppSection("library");
      const row = params.get("row");
      setLibraryRowId(row && row.length > 0 ? row : null);
      return;
    }

    setAppSection("graph");
    const v = params.get("view");
    if (v === "overview" || v === "focus" || v === "hierarchy") setView(v);
    const nodeParam = params.get("node");
    if (nodeParam != null && nodeParam !== "") {
      const id = parseInt(nodeParam, 10);
      if (!Number.isNaN(id)) setSelectedNodeId(id);
    }
  }, []);

  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (appSection === "library") {
      params.set("page", "library");
      if (libraryRowId) params.set("row", libraryRowId);
    } else {
      params.set("page", "graph");
      params.set("view", view);
      if (selectedNodeId != null) params.set("node", String(selectedNodeId));
    }
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [appSection, libraryRowId, view, selectedNodeId]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);
}
