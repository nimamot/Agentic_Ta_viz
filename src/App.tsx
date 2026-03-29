import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAppHash } from "./hooks/useAppHash";
import { buildGraphData, buildOverviewNodes, buildOverviewEdges, buildFocusSubgraph, getVisibleEdges, computeGraphStats } from "./lib/graphBuilder";
import {
  buildHierarchicalGraphData,
  buildHierarchyVisEdges,
  buildHierarchyVisNodes,
  isHierarchicalCodebookJson,
} from "./lib/hierarchicalGraphBuilder";
import type { GraphData, ViewMode, CodebookJson } from "./types";
import { GraphView } from "./components/GraphView";
import { DetailsPanel } from "./components/DetailsPanel";
import { StatsPanel } from "./components/StatsPanel";
import { HelpModal } from "./components/HelpModal";
import { LibraryView } from "./components/LibraryView";

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const [jsonInput, setJsonInput] = useState("");
  const [hierarchyJsonInput, setHierarchyJsonInput] = useState("");
  const [codebookGraphData, setCodebookGraphData] = useState<GraphData | null>(null);
  const [hierarchyGraphData, setHierarchyGraphData] = useState<GraphData | null>(null);
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
  const [appSection, setAppSection] = useState<"graph" | "library">("graph");
  const [libraryRowId, setLibraryRowId] = useState<string | null>(null);

  const setView = useCallback((v: ViewMode) => setViewMode(v), []);
  const graphData = useMemo(
    () => (viewMode === "hierarchy" ? hierarchyGraphData : codebookGraphData),
    [viewMode, hierarchyGraphData, codebookGraphData]
  );

  useAppHash({
    appSection,
    setAppSection,
    view: viewMode,
    selectedNodeId,
    setView,
    setSelectedNodeId,
    libraryRowId,
    setLibraryRowId,
  });

  useEffect(() => {
    if (!graphData) return;
    if (selectedNodeId != null && graphData.nodeMap.has(selectedNodeId)) return;
    if (viewMode === "hierarchy") {
      const theme = graphData.nodes.find((n) => n.hierarchyRole === "theme");
      setSelectedNodeId(theme?.id ?? graphData.nodes[0]?.id ?? null);
    } else {
      const top = graphData.nodes.slice().sort((a, b) => b.degree - a.degree)[0];
      setSelectedNodeId(top?.id ?? null);
    }
  }, [viewMode, graphData, selectedNodeId]);

  const buildCodebook = useCallback(() => {
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
      setCodebookGraphData(data);
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
  }, [jsonInput, selectedNodeId]);

  const buildHierarchy = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(hierarchyJsonInput.trim());
    } catch (e) {
      showStatusMessage("Invalid JSON: " + (e as Error).message, "error");
      return;
    }
    if (!isHierarchicalCodebookJson(parsed)) {
      showStatusMessage(
        'Expected hierarchical format: top-level keys map to { "label", "sub_themes", "ungrouped_codes" }.',
        "error"
      );
      return;
    }
    try {
      const data = buildHierarchicalGraphData(parsed);
      if (data.nodeCount === 0) {
        showStatusMessage("No clusters found in JSON.", "error");
        return;
      }
      setHierarchyGraphData(data);
      const theme = data.nodes.find((n) => n.hierarchyRole === "theme");
      const pick = theme ?? data.nodes[0];
      setSelectedNodeId(pick?.id ?? null);
      setNodeSearch(pick?.label ?? "");
      showStatusMessage(`${data.nodeCount} nodes · ${data.edgeCount} edges (hierarchy)`, "info");
      setTimeout(clearStatus, 2500);
    } catch (e) {
      showStatusMessage("Build error: " + (e as Error).message, "error");
    }
  }, [hierarchyJsonInput]);

  const build = useCallback(() => {
    if (viewMode === "hierarchy") buildHierarchy();
    else buildCodebook();
  }, [viewMode, buildCodebook, buildHierarchy]);

  useKeyboardShortcuts({
    onEscape: () => setSelectedNodeId(null),
    onFocusSearch: () => appSection === "graph" && searchInputRef.current?.focus(),
    onHelp: () => setShowHelp((h) => !h),
    onBuild: appSection === "graph" ? build : () => {},
    searchFocused,
  });

  function showStatusMessage(msg: string, type: "info" | "error") {
    setStatus({ message: msg, type });
  }

  function clearStatus() {
    setStatus({ message: "", type: null });
  }

  const visibleEdges = useMemo(() => {
    if (!graphData) return [];
    if (viewMode === "hierarchy") return graphData.edges;
    return getVisibleEdges(graphData, showInferred);
  }, [graphData, viewMode, showInferred]);

  const overviewNodes = useMemo(
    () =>
      graphData && viewMode !== "hierarchy"
        ? buildOverviewNodes(graphData, selectedNodeId, showLabels, colorClusters)
        : [],
    [graphData, viewMode, selectedNodeId, showLabels, colorClusters]
  );

  const overviewEdges = useMemo(
    () =>
      graphData && viewMode !== "hierarchy"
        ? buildOverviewEdges(graphData, selectedNodeId, showInferred, isDark)
        : [],
    [graphData, viewMode, selectedNodeId, showInferred, isDark]
  );

  const hierarchyVisNodes = useMemo(
    () =>
      graphData && viewMode === "hierarchy"
        ? buildHierarchyVisNodes(graphData, selectedNodeId, showLabels, colorClusters)
        : [],
    [graphData, viewMode, selectedNodeId, showLabels, colorClusters]
  );

  const hierarchyVisEdges = useMemo(
    () =>
      graphData && viewMode === "hierarchy"
        ? buildHierarchyVisEdges(graphData, selectedNodeId, isDark)
        : [],
    [graphData, viewMode, selectedNodeId, isDark]
  );

  const focusSubgraph = useMemo(() => {
    if (viewMode !== "focus" || !graphData || selectedNodeId == null || !graphData.nodeMap.has(selectedNodeId))
      return null;
    return buildFocusSubgraph(graphData, selectedNodeId, twoHop ? 2 : 1, showInferred, colorClusters, isDark);
  }, [viewMode, graphData, selectedNodeId, twoHop, showInferred, colorClusters, isDark]);

  const visNodes =
    viewMode === "focus" && focusSubgraph
      ? focusSubgraph.nodes
      : viewMode === "hierarchy"
        ? hierarchyVisNodes
        : overviewNodes;
  const visEdges =
    viewMode === "focus" && focusSubgraph
      ? focusSubgraph.edges
      : viewMode === "hierarchy"
        ? hierarchyVisEdges
        : overviewEdges;
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
    if (viewMode !== "hierarchy") setViewMode("focus");
  }, [nodeSearch, findNodeByLabel, viewMode]);

  return (
    <div className="app" data-theme={isDark ? "dark" : "light"}>
      <header className="header">
        <h1>Codebook Observatory</h1>
        <div className="controls">
          <div className="tabs app-section-tabs">
            <button
              type="button"
              className={`tab ${appSection === "graph" ? "active" : ""}`}
              onClick={() => setAppSection("graph")}
            >
              Graph
            </button>
            <button
              type="button"
              className={`tab ${appSection === "library" ? "active" : ""}`}
              onClick={() => setAppSection("library")}
            >
              Library
            </button>
          </div>
          {appSection === "graph" && (
            <>
              <div className="tabs">
                <button type="button" className={`tab ${viewMode === "overview" ? "active" : ""}`} onClick={() => setViewMode("overview")}>
                  Overview
                </button>
                <button type="button" className={`tab ${viewMode === "focus" ? "active" : ""}`} onClick={() => setViewMode("focus")}>
                  Focus
                </button>
                <button
                  type="button"
                  className={`tab ${viewMode === "hierarchy" ? "active" : ""}`}
                  onClick={() => setViewMode("hierarchy")}
                >
                  Hierarchy
                </button>
              </div>
              {viewMode !== "hierarchy" && (
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={showInferred} onChange={(e) => setShowInferred(e.target.checked)} />
                  <span>Inferred</span>
                </label>
              )}
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
                <button type="button" onClick={handleFocusNode}>
                  {viewMode === "hierarchy" ? "Find" : "Focus"}
                </button>
                {viewMode === "focus" && (
                  <button type="button" className="secondary" onClick={() => setViewMode("overview")}>
                    ← Back
                  </button>
                )}
              </div>
              <button type="button" className="icon-btn" onClick={handleExportPng} title="Export PNG">
                Export
              </button>
            </>
          )}
          <button type="button" className="icon-btn" onClick={() => setShowHelp(true)} title="Help (?)">
            ?
          </button>
          <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {isDark ? "☀" : "☽"}
          </button>
        </div>
      </header>

      {appSection === "library" ? (
        <LibraryView selectedRowId={libraryRowId} onSelectRow={setLibraryRowId} isDark={isDark} />
      ) : (
      <div className="main">
        <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="sidebar-header">
            <span>{viewMode === "hierarchy" ? "Hierarchy JSON" : "Codebook JSON"}</span>
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
                {viewMode === "hierarchy" ? (
                  <>
                    Paste hierarchical JSON: each key maps to{" "}
                    <code>label</code>, <code>sub_themes</code> (optional groups with <code>codes</code>), and{" "}
                    <code>ungrouped_codes</code>. Theme → sub-theme → code edges are built automatically.
                  </>
                ) : (
                  <>
                    Paste JSON with canonical_nodes, merge_groups, edges, inferred_edges.
                    Overview = full map. Focus = selected node neighborhood.
                  </>
                )}
              </p>
              <textarea
                value={viewMode === "hierarchy" ? hierarchyJsonInput : jsonInput}
                onChange={(e) =>
                  viewMode === "hierarchy"
                    ? setHierarchyJsonInput(e.target.value)
                    : setJsonInput(e.target.value)
                }
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && build()}
                placeholder={
                  viewMode === "hierarchy"
                    ? '{"0": { "label": "Theme", "sub_themes": [], "ungrouped_codes": [] }}'
                    : '{"canonical_nodes": [...], "edges": [...]}'
                }
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
                : viewMode === "hierarchy"
                  ? `Hierarchy · ${graphData?.nodeCount ?? 0} nodes`
                  : `Overview · ${graphData?.nodeCount ?? 0} nodes`}
            </span>
            {viewMode === "hierarchy" ? (
              <span><i className="dot" /> Theme → sub-theme → code</span>
            ) : (
              <>
                <span><i className="dot" /> Direct</span>
                <span><i className="dot inferred" /> Inferred</span>
              </>
            )}
            <span className="legend-hint">scroll to zoom · drag to pan</span>
          </div>
        </div>
      </div>
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
