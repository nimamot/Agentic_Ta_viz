import { useState } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAppHash, type AppTab } from "./hooks/useAppHash";
import { HelpModal } from "./components/HelpModal";
import { LibraryView } from "./components/LibraryView";
import { ResearchOverview } from "./components/ResearchOverview";

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const [libraryRowId, setLibraryRowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");

  useAppHash({ libraryRowId, setLibraryRowId, setActiveTab });

  useKeyboardShortcuts({
    onEscape: () => {
      if (activeTab === "library") setLibraryRowId(null);
    },
    onHelp: () => setShowHelp((h) => !h),
  });

  return (
    <div className="app" data-theme={isDark ? "dark" : "light"}>
      <header className="header">
        <nav className="header-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={`header-tab ${activeTab === "overview" ? "header-tab--active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "library"}
            className={`header-tab ${activeTab === "library" ? "header-tab--active" : ""}`}
            onClick={() => setActiveTab("library")}
          >
            Library
          </button>
        </nav>
        <div className="controls">
          <button type="button" className="icon-btn" onClick={() => setShowHelp(true)} title="Help (?)">
            ?
          </button>
          <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {isDark ? "☀" : "☽"}
          </button>
        </div>
      </header>

      {activeTab === "overview" && <ResearchOverview isDark={isDark} />}
      {activeTab === "library" && (
        <LibraryView selectedRowId={libraryRowId} onSelectRow={setLibraryRowId} isDark={isDark} />
      )}

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
