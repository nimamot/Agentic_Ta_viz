import { useState } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAppHash } from "./hooks/useAppHash";
import { HelpModal } from "./components/HelpModal";
import { LibraryView } from "./components/LibraryView";

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const [libraryRowId, setLibraryRowId] = useState<string | null>(null);

  useAppHash({ libraryRowId, setLibraryRowId });

  useKeyboardShortcuts({
    onEscape: () => setLibraryRowId(null),
    onHelp: () => setShowHelp((h) => !h),
  });

  return (
    <div className="app" data-theme={isDark ? "dark" : "light"}>
      <header className="header">
        <h1>Research library</h1>
        <div className="controls">
          <button type="button" className="icon-btn" onClick={() => setShowHelp(true)} title="Help (?)">
            ?
          </button>
          <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {isDark ? "☀" : "☽"}
          </button>
        </div>
      </header>

      <LibraryView selectedRowId={libraryRowId} onSelectRow={setLibraryRowId} isDark={isDark} />

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
