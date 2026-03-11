import { useEffect } from "react";

interface ShortcutsConfig {
  onEscape?: () => void;
  onFocusSearch?: () => void;
  onHelp?: () => void;
  onBuild?: () => void;
  searchFocused?: boolean;
}

export function useKeyboardShortcuts({
  onEscape,
  onFocusSearch,
  onHelp,
  onBuild,
  searchFocused,
}: ShortcutsConfig) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key === "/" && !searchFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onHelp?.();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onBuild?.();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onEscape, onFocusSearch, onHelp, onBuild, searchFocused]);
}
