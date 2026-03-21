import { useState, useCallback, useRef, useMemo } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUrlState } from "./hooks/useUrlState";
import { buildGraphData, buildOverviewNodes, buildOverviewEdges, buildFocusSubgraph, getVisibleEdges, computeGraphStats } from "./lib/graphBuilder";
import type { GraphData, ViewMode, CodebookJson } from "./types";
import { GraphView } from "./components/GraphView";
import { DetailsPanel } from "./components/DetailsPanel";
import { StatsPanel } from "./components/StatsPanel";
import { HelpModal } from "./components/HelpModal";

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const [jsonInput, setJsonInput] = useState("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [showInferred, setShowInferred] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [colorClusters, setColorClusters] = useState(true);
  const [twoHop, setTwoHop] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: "info" | "error" | null }>({ message: "", type: null });
  const [showHelp, setShowHelp] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const setView = useCallback((v: ViewMode) => setViewMode(v), []);
  const nodeLabelById = useCallback(
    (id: number) => graphData?.nodeMap.get(id)?.label,
    [graphData]
  );
  useUrlState(viewMode, selectedNodeId, setView, setSelectedNodeId, nodeLabelById);

  const build = useCallback(() => {
    let json: CodebookJson;
    try {
      json = JSON.parse(jsonInput.trim());
    } catch (e) {
      showStatusMessage("Invalid JSON: " + (e as Error).message, "error");
      return;
    }
    if (!json.edges?.length && !json.inferred_edges?.length) {
      showStatusMessage('JSON must contain "edges" or "inferred_edges".', "error");
      return;
    }
    try {
      const data = buildGraphData(json);
      setGraphData(data);
      if (selectedNodeId == null || !data.nodeMap.has(selectedNodeId)) {
        const top = data.nodes.slice().sort((a, b) => b.degree - a.degree)[0];
        setSelectedNodeId(top?.id ?? null);
      }
      setNodeSearch(
        selectedNodeId != null && data.nodeMap.has(selectedNodeId)
          ? data.nodeMap.get(selectedNodeId)!.label
          : (data.nodes.slice().sort((a, b) => b.degree - a.degree)[0]?.label ?? "")
      );
      showStatusMessage(`${data.nodeCount} nodes · ${data.edgeCount} edges`, "info");
      setTimeout(clearStatus, 2500);
    } catch (e) {
      showStatusMessage("Build error: " + (e as Error).message, "error");
    }
  }, [jsonInput, viewMode, selectedNodeId]);

  useKeyboardShortcuts({
    onEscape: () => setSelectedNodeId(null),
    onFocusSearch: () => searchInputRef.current?.focus(),
    onHelp: () => setShowHelp((h) => !h),
    onBuild: build,
    searchFocused,
  });

  function showStatusMessage(msg: string, type: "info" | "error") {
    setStatus({ message: msg, type });
  }

  function clearStatus() {
    setStatus({ message: "", type: null });
  }

  const visibleEdges = useMemo(
    () => (graphData ? getVisibleEdges(graphData, showInferred) : []),
    [graphData, showInferred]
  );

  const overviewNodes = useMemo(
    () => (graphData ? buildOverviewNodes(graphData, selectedNodeId, showLabels, colorClusters) : []),
    [graphData, selectedNodeId, showLabels, colorClusters]
  );

  const overviewEdges = useMemo(
    () => (graphData ? buildOverviewEdges(graphData, selectedNodeId, showInferred, isDark) : []),
    [graphData, selectedNodeId, showInferred, isDark]
  );

  const focusSubgraph = useMemo(() => {
    if (!graphData || selectedNodeId == null || !graphData.nodeMap.has(selectedNodeId)) return null;
    return buildFocusSubgraph(graphData, selectedNodeId, twoHop ? 2 : 1, showInferred, colorClusters, isDark);
  }, [graphData, selectedNodeId, twoHop, showInferred, colorClusters, isDark]);

  const visNodes = viewMode === "focus" && focusSubgraph ? focusSubgraph.nodes : overviewNodes;
  const visEdges = viewMode === "focus" && focusSubgraph ? focusSubgraph.edges : overviewEdges;
  const renderedNodeCount = viewMode === "focus" && focusSubgraph ? focusSubgraph.nodeCount : graphData?.nodeCount ?? 0;
  const renderedEdgeCount = viewMode === "focus" && focusSubgraph ? focusSubgraph.edgeCount : visibleEdges.length;
  const renderedDepth = viewMode === "focus" && focusSubgraph ? focusSubgraph.depth : 0;

  const stats = graphData ? computeGraphStats(graphData) : null;

  const handleExportPng = useCallback(() => {
    const dataUrl = (window as unknown as { __graphExport?: () => string | null }).__graphExport?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "codebook-graph.png";
    a.click();
  }, []);

  const handleNodeSelect = useCallback((id: number) => {
    setSelectedNodeId(id);
    if (graphData?.nodeMap.has(id)) setNodeSearch(graphData.nodeMap.get(id)!.label);
  }, [graphData]);

  const findNodeByLabel = useCallback(
    (label: string): number | null => {
      if (!graphData) return null;
      const norm = label.trim().toLowerCase();
      if (!norm) return null;
      const exact = graphData.nodes.find((n) => n.label.toLowerCase() === norm);
      if (exact) return exact.id;
      const alias = graphData.nodes.find((n) => n.aliases.some((a) => a.toLowerCase() === norm));
      return alias?.id ?? null;
    },
    [graphData]
  );

  const handleFocusNode = useCallback(() => {
    const id = findNodeByLabel(nodeSearch);
    if (id == null) {
      showStatusMessage("Node not found.", "error");
      return;
    }
    setSelectedNodeId(id);
    setViewMode("focus");
  }, [nodeSearch, findNodeByLabel]);

  return (
    <div className="app" data-theme={isDark ? "dark" : "light"}>
      <header className="header">
        <h1>Codebook Observatory</h1>
        <div className="controls">
          <div className="tabs">
            <button type="button" className={`tab ${viewMode === "overview" ? "active" : ""}`} onClick={() => setViewMode("overview")}>
              Overview
            </button>
            <button type="button" className={`tab ${viewMode === "focus" ? "active" : ""}`} onClick={() => setViewMode("focus")}>
              Focus
            </button>
          </div>
          <label className="checkbox-wrap">
            <input type="checkbox" checked={showInferred} onChange={(e) => setShowInferred(e.target.checked)} />
            <span>Inferred</span>
          </label>
          <label className="checkbox-wrap">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            <span>Labels</span>
          </label>
          <label className="checkbox-wrap">
            <input type="checkbox" checked={colorClusters} onChange={(e) => setColorClusters(e.target.checked)} />
            <span>Clusters</span>
          </label>
          {viewMode === "focus" && (
            <label className="checkbox-wrap">
              <input type="checkbox" checked={twoHop} onChange={(e) => setTwoHop(e.target.checked)} />
              <span>2-hop</span>
            </label>
          )}
          <div className="search-wrap">
            <input
              ref={searchInputRef}
              list="node-list"
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && handleFocusNode()}
              placeholder="Find node…"
              aria-label="Search node"
            />
            <datalist id="node-list">
              {graphData?.nodes.map((n) => (
                <option key={n.id} value={n.label} />
              ))}
            </datalist>
            <button type="button" onClick={handleFocusNode}>Focus</button>
            {viewMode === "focus" && (
              <button type="button" className="secondary" onClick={() => setViewMode("overview")}>
                ← Back
              </button>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={handleExportPng} title="Export PNG">
            Export
          </button>
          <button type="button" className="icon-btn" onClick={() => setShowHelp(true)} title="Help (?)">
            ?
          </button>
          <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {isDark ? "☀" : "☽"}
          </button>
        </div>
      </header>

      <div className="main">
        <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sidebar-header">
            <span>Codebook JSON</span>
            <button
              type="button"
              className="collapse-btn"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? "Expand" : "Collapse"}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          {!sidebarCollapsed && (
            <>
              <p className="helper">
                Paste JSON with canonical_nodes, merge_groups, edges, inferred_edges.
                Overview = full map. Focus = selected node neighborhood.
              </p>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && build()}
                placeholder='{"canonical_nodes": [...], "edges": [...]}'
              />
              <button type="button" className="btn" onClick={build}>
                ▶ Build graph
              </button>
              {stats && (
                <StatsPanel
                  nodeCount={stats.nodeCount}
                  edgeCount={stats.edgeCount}
                  componentCount={stats.componentCount}
                  density={stats.density}
                  maxDegree={stats.maxDegree}
                  directEdges={stats.directEdgeCount}
                  inferredEdges={stats.inferredEdgeCount}
                  visibleNodes={viewMode === "focus" ? renderedNodeCount : undefined}
                  visibleEdges={viewMode === "focus" ? renderedEdgeCount : undefined}
                  viewMode={viewMode}
                />
              )}
            </>
          )}
        </aside>

        <div className="graph-area">
          {status.type && (
            <div className={`status ${status.type}`}>{status.message}</div>
          )}
          <GraphView
            nodes={visNodes}
            edges={visEdges}
            mode={viewMode}
            onNodeSelect={handleNodeSelect}
            fitOnStabilized={true}
          />
          <DetailsPanel
            data={graphData}
            selectedNodeId={selectedNodeId}
            viewMode={viewMode}
            renderedNodeCount={renderedNodeCount}
            renderedDepth={renderedDepth}
          />
          <div className="legend">
            <span className="legend-stats">
              {viewMode === "focus"
                ? `Focus · ${renderedNodeCount} nodes`
                : `Overview · ${graphData?.nodeCount ?? 0} nodes`}
            </span>
            <span><i className="dot" /> Direct</span>
            <span><i className="dot inferred" /> Inferred</span>
            <span className="legend-hint">scroll to zoom · drag to pan</span>
          </div>
        </div>
      </div>

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
