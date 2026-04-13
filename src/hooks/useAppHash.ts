import { useEffect, useCallback } from "react";

export type AppTab = "overview" | "library";

interface UseAppHashArgs {
  libraryRowId: string | null;
  setLibraryRowId: (id: string | null) => void;
  setActiveTab: (tab: AppTab) => void;
}

function parseHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

/** Hash query for Library (same shape as `syncUrl`). */
export function libraryHashQuery(rowId: string | null): string {
  const params = new URLSearchParams();
  params.set("page", "library");
  if (rowId) params.set("row", rowId);
  return params.toString();
}

/** Absolute URL to open Library with a given research row selected (for sharing). */
export function buildLibraryShareUrl(rowId: string): string {
  return `${window.location.origin}${window.location.pathname}#${libraryHashQuery(rowId)}`;
}

function applyHashToApp(
  setLibraryRowId: (id: string | null) => void,
  setActiveTab: (tab: AppTab) => void
): void {
  const params = parseHash();
  const rowRaw = params.get("row");
  const row = rowRaw?.trim() ?? "";
  const openLibrary = params.get("page") === "library" || row.length > 0;
  if (openLibrary) {
    setActiveTab("library");
  }
  if (row.length > 0) {
    setLibraryRowId(row);
  }
}

export function useAppHash({ libraryRowId, setLibraryRowId, setActiveTab }: UseAppHashArgs) {
  useEffect(() => {
    const onHashChange = () => applyHashToApp(setLibraryRowId, setActiveTab);
    applyHashToApp(setLibraryRowId, setActiveTab);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setLibraryRowId, setActiveTab]);

  const syncUrl = useCallback(() => {
    window.history.replaceState(null, "", `#${libraryHashQuery(libraryRowId)}`);
  }, [libraryRowId]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);
}
