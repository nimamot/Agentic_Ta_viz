import { useEffect, useCallback } from "react";
import { isLocalMode } from "../lib/dataSource";

export type AppTab = "overview" | "library" | "codebook";

interface UseAppHashArgs {
  activeTab: AppTab;
  libraryRowId: string | null;
  codebookReviewId: string | null;
  setLibraryRowId: (id: string | null) => void;
  setCodebookReviewId: (id: string | null) => void;
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

/** Hash query for Codebook Review tab. */
export function codebookHashQuery(reviewId: string | null): string {
  const params = new URLSearchParams();
  params.set("page", "codebook");
  if (reviewId?.trim()) params.set("review", reviewId.trim());
  return params.toString();
}

function applyHashToApp(
  setLibraryRowId: (id: string | null) => void,
  setCodebookReviewId: (id: string | null) => void,
  setActiveTab: (tab: AppTab) => void
): void {
  const params = parseHash();
  const page = params.get("page");
  const rowRaw = params.get("row");
  const row = rowRaw?.trim() ?? "";
  const review = params.get("review")?.trim() ?? "";

  if (page === "codebook") {
    setActiveTab("codebook");
    if (review) setCodebookReviewId(review);
    return;
  }

  if (page === "overview" && !isLocalMode()) {
    setActiveTab("overview");
    return;
  }

  const openLibrary = page === "library" || row.length > 0 || isLocalMode();
  if (openLibrary) {
    setActiveTab("library");
  }
  if (row.length > 0) {
    setLibraryRowId(row);
  }
}

export function useAppHash({
  activeTab,
  libraryRowId,
  codebookReviewId,
  setLibraryRowId,
  setCodebookReviewId,
  setActiveTab,
}: UseAppHashArgs) {
  useEffect(() => {
    const onHashChange = () => applyHashToApp(setLibraryRowId, setCodebookReviewId, setActiveTab);
    applyHashToApp(setLibraryRowId, setCodebookReviewId, setActiveTab);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setLibraryRowId, setCodebookReviewId, setActiveTab]);

  const syncUrl = useCallback(() => {
    if (activeTab === "library") {
      window.history.replaceState(null, "", `#${libraryHashQuery(libraryRowId)}`);
      return;
    }
    if (activeTab === "codebook") {
      window.history.replaceState(null, "", `#${codebookHashQuery(codebookReviewId)}`);
      return;
    }
    if (!isLocalMode()) {
      window.history.replaceState(null, "", "#page=overview");
    } else {
      window.history.replaceState(null, "", `#${libraryHashQuery(libraryRowId)}`);
    }
  }, [activeTab, libraryRowId, codebookReviewId]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);
}
