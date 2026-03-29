import { useEffect, useCallback } from "react";
import type { ViewMode } from "../types";

export function useUrlState(
  view: ViewMode,
  selectedNodeId: number | null,
  setView: (v: ViewMode) => void,
  setSelectedNodeId: (id: number | null) => void,
  _nodeLabelById: (id: number) => string | undefined
) {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
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
    params.set("view", view);
    if (selectedNodeId != null) params.set("node", String(selectedNodeId));
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [view, selectedNodeId]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  const shareableUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}#view=${view}${selectedNodeId != null ? `&node=${selectedNodeId}` : ""}`
    : "";
  return { shareableUrl };
}
