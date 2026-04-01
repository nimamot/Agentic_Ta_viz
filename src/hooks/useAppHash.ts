import { useEffect, useCallback } from "react";

interface UseAppHashArgs {
  libraryRowId: string | null;
  setLibraryRowId: (id: string | null) => void;
}

function parseHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function useAppHash({ libraryRowId, setLibraryRowId }: UseAppHashArgs) {
  useEffect(() => {
    const params = parseHash();
    const row = params.get("row");
    if (row && row.length > 0) {
      setLibraryRowId(row);
      return;
    }
    if (params.get("page") === "library") {
      const r2 = params.get("row");
      if (r2 && r2.length > 0) setLibraryRowId(r2);
    }
  }, []);

  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", "library");
    if (libraryRowId) params.set("row", libraryRowId);
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [libraryRowId]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);
}
