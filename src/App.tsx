import { useState } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAppHash } from "./hooks/useAppHash";
import { HelpModal } from "./components/HelpModal";
import { LibraryView } from "./components/LibraryView";
import { ResearchOverview } from "./components/ResearchOverview";

type AppTab = "overview" | "library";

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const [libraryRowId, setLibraryRowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");

  useAppHash({ libraryRowId, setLibraryRowId });

  useKeyboardShortcuts({
    onEscape: () => {
      if (activeTab === "library") setLibraryRowId(null);
    },
    onHelp: () => setShowHelp((h) => !h),
  });

  return (
    <div className="app" data-theme={isDark ? "dark" : "light"}>
      <header className="header">
        <h1>
          <span className="header-brand-icon" aria-hidden="true">
            <svg
              className="header-brand-icon-svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Research library
        </h1>
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
