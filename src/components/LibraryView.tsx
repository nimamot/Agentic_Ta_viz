import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchResearchProjects } from "../lib/fetchResearchProjects";
import { getSupabaseTableName, isSupabaseConfigured } from "../lib/supabaseClient";
import {
  buildGraphData,
  buildOverviewEdges,
  buildOverviewNodes,
  computeGraphStats,
} from "../lib/graphBuilder";
import { buildHierarchyVisEdges, buildHierarchyVisNodes } from "../lib/hierarchicalGraphBuilder";
import { buildHierarchyGraphFromThemeTree, isThemeTreeDocument } from "../lib/themeTree";
import {
  computeDirectedDepthFromRoot,
  findDirectedTreeRootId,
  maxDirectedChildFanOut,
  maxNodesOnAnyLevelFromDepthMap,
  remapDepthsAfterStrippingRoot,
  removeExpandedSubtreeFromSet,
  sliceExpandedTree,
  stripTreeRootFromGraph,
} from "../lib/treeDrilldown";
import type { CodebookJson, GraphData, ResearchProjectRow } from "../types";
import { GraphView } from "./GraphView";
import { StatsPanel } from "./StatsPanel";

interface LibraryViewProps {
  selectedRowId: string | null;
  onSelectRow: (id: string | null) => void;
  isDark: boolean;
}

function unwrapJsonField(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

type GlobalVizKind = "tree" | "edges";

function tryParseGlobalGraph(raw: unknown): {
  data: GraphData | null;
  error: string | null;
  vizKind: GlobalVizKind | null;
} {
  const u = unwrapJsonField(raw);
  if (u == null || typeof u !== "object" || Array.isArray(u)) {
    return { data: null, error: "global_graph is missing or not an object.", vizKind: null };
  }
  const o = u as CodebookJson;

  // Prefer embedded tree for nested top-down layout (same shape as codebook pipeline export).
  if (isThemeTreeDocument(u)) {
    try {
      const data = buildHierarchyGraphFromThemeTree(u.tree);
      if (data.nodeCount === 0) {
        return { data: null, error: "global_graph tree is empty.", vizKind: null };
      }
      return { data, error: null, vizKind: "tree" };
    } catch (e) {
      return { data: null, error: (e as Error).message, vizKind: null };
    }
  }

  const hasEdges = Array.isArray(o.edges) && o.edges.length > 0;
  const hasInferred = Array.isArray(o.inferred_edges) && o.inferred_edges.length > 0;
  if (hasEdges || hasInferred) {
    try {
      return { data: buildGraphData(o), error: null, vizKind: "edges" };
    } catch (e) {
      return { data: null, error: (e as Error).message, vizKind: null };
    }
  }

  return {
    data: null,
    error:
      "global_graph needs edges (or inferred_edges), or a root object { tree: { name, type, children } }.",
    vizKind: null,
  };
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function LibraryView({ selectedRowId, onSelectRow, isDark }: LibraryViewProps) {
  const [rows, setRows] = useState<ResearchProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [colorClusters, setColorClusters] = useState(true);
  const [showInferred, setShowInferred] = useState(true);
  /** Hide the JSON root so its children become multiple top-level roots in the layout. */
  const [omitTopParent, setOmitTopParent] = useState(true);
  const [selGlobal, setSelGlobal] = useState<number | null>(null);
  /** For global tree: which node ids have their children revealed (ancestors stay visible). */
  const [globalExpandedIds, setGlobalExpandedIds] = useState<Set<number>>(() => new Set());

  const configured = isSupabaseConfigured();
  const tableName = getSupabaseTableName();

  const load = useCallback(async () => {
    if (!configured) {
      setFetchError("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.");
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchResearchProjects();
      setRows(data);
    } catch (e) {
      setRows([]);
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (selectedRowId == null || !rows.some((r) => r.id === selectedRowId)) {
      onSelectRow(rows[0].id);
    }
  }, [rows, selectedRowId, onSelectRow]);

  const selected = rows.find((r) => r.id === selectedRowId) ?? null;

  const globalParsed = useMemo(
    () =>
      selected
        ? tryParseGlobalGraph(selected.global_graph)
        : { data: null, error: null, vizKind: null as GlobalVizKind | null },
    [selected]
  );

  const gData = globalParsed.data;
  const globalVizKind = globalParsed.vizKind;

  const treeRootId = useMemo(() => {
    if (!gData || globalVizKind !== "tree") return null;
    return findDirectedTreeRootId(gData);
  }, [gData, globalVizKind]);

  useEffect(() => {
    if (treeRootId != null) setGlobalExpandedIds(new Set([treeRootId]));
    else setGlobalExpandedIds(new Set());
  }, [treeRootId, selectedRowId]);

  const gDataVisible = useMemo(() => {
    if (!gData) return null;
    if (globalVizKind !== "tree" || treeRootId == null) return gData;
    return sliceExpandedTree(gData, treeRootId, globalExpandedIds);
  }, [gData, globalVizKind, treeRootId, globalExpandedIds]);

  const strippedTreePreview = useMemo(() => {
    if (!gDataVisible || treeRootId == null) return null;
    return stripTreeRootFromGraph(gDataVisible, treeRootId);
  }, [gDataVisible, treeRootId]);

  const treeStripApplied =
    globalVizKind === "tree" && omitTopParent && strippedTreePreview != null && strippedTreePreview.nodeCount > 0;

  /** Graph passed to vis (children as roots when strip is on and non-empty). */
  const gDataForVis = useMemo(() => {
    if (!gDataVisible) return null;
    return treeStripApplied && strippedTreePreview ? strippedTreePreview : gDataVisible;
  }, [gDataVisible, treeStripApplied, strippedTreePreview]);

  useEffect(() => {
    if (!gData) {
      setSelGlobal(null);
      return;
    }
    if (globalVizKind === "edges") {
      const top = gData.nodes.slice().sort((a, b) => b.degree - a.degree)[0];
      setSelGlobal(top?.id ?? null);
    }
  }, [gData, globalVizKind, selectedRowId]);

  const handleGlobalNodeSelect = useCallback(
    (id: number) => {
      setSelGlobal(id);
      if (globalVizKind !== "tree" || !gData) return;
      const hasChildren = gData.edges.some((e) => e.from === id);
      if (!hasChildren) return;
      setGlobalExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          removeExpandedSubtreeFromSet(next, gData, id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [globalVizKind, gData]
  );

  const handleGlobalTreeReset = useCallback(() => {
    if (treeRootId != null) setGlobalExpandedIds(new Set([treeRootId]));
  }, [treeRootId]);

  const globalTreeDepthByNode = useMemo(() => {
    if (globalVizKind !== "tree" || !gDataVisible || treeRootId == null) return undefined;
    const base = computeDirectedDepthFromRoot(gDataVisible, treeRootId);
    if (!treeStripApplied) return base;
    return remapDepthsAfterStrippingRoot(base, treeRootId);
  }, [globalVizKind, gDataVisible, treeRootId, treeStripApplied]);

  const globalTreeMaxDepth = useMemo(() => {
    if (!globalTreeDepthByNode) return 0;
    let m = 0;
    for (const d of globalTreeDepthByNode.values()) m = Math.max(m, d);
    return m;
  }, [globalTreeDepthByNode]);

  const globalHierarchicalSpacing = useMemo(() => {
    if (globalVizKind !== "tree" || !gDataForVis || !globalTreeDepthByNode || treeRootId == null) return undefined;
    const fanOut = maxDirectedChildFanOut(gDataForVis);
    const breadth = maxNodesOnAnyLevelFromDepthMap(gDataForVis, globalTreeDepthByNode);
    const themeRowOnlyLayout =
      treeStripApplied && gDataForVis.edgeCount === 0 && gDataForVis.nodeCount > 0;
    let nodeSpacing = Math.min(840, Math.max(260, 88 + fanOut * 32 + breadth * 20));
    if (themeRowOnlyLayout) {
      nodeSpacing = Math.min(920, Math.max(nodeSpacing, 110 + breadth * 44));
    }
    let levelSeparation = Math.min(520, 310 + globalTreeMaxDepth * 12 + Math.min(breadth, 24) * 6);
    if (themeRowOnlyLayout) {
      levelSeparation = Math.max(levelSeparation, 160);
    }
    let treeSpacing = Math.min(960, 680 + breadth * 14);
    if (themeRowOnlyLayout) {
      treeSpacing = Math.max(treeSpacing, 820);
    }
    return { levelSeparation, nodeSpacing, treeSpacing };
  }, [
    globalVizKind,
    gDataForVis,
    treeRootId,
    globalTreeMaxDepth,
    globalTreeDepthByNode,
    treeStripApplied,
  ]);

  /** JSON often sets `tree.name` to the research question; RQ is already in the page header — shorten root on canvas. */
  const globalCanvasLabelOverrides = useMemo(() => {
    if (treeStripApplied) return undefined;
    if (globalVizKind !== "tree" || !gData || treeRootId == null || !selected) return undefined;
    const rq = selected.research_question?.trim();
    if (!rq) return undefined;
    const root = gData.nodeMap.get(treeRootId);
    if (!root) return undefined;
    const asLabel = root.label.trim();
    const asTitle = String(root.title ?? "").trim();
    if (asLabel !== rq && asTitle !== rq) return undefined;
    const short = selected.slug?.trim() || "Overview";
    return new Map<number, string>([[treeRootId, short]]);
  }, [globalVizKind, gData, treeRootId, selected, treeStripApplied]);

  const globalTreeHierarchyOptions = useMemo(() => {
    if (!globalTreeDepthByNode) return undefined;
    return {
      treeDepthByNodeId: globalTreeDepthByNode,
      treeTheme: isDark ? ("dark" as const) : ("light" as const),
      ...(globalCanvasLabelOverrides?.size
        ? { canvasLabelByNodeId: globalCanvasLabelOverrides }
        : {}),
    };
  }, [globalTreeDepthByNode, isDark, globalCanvasLabelOverrides]);

  const gNodes = useMemo(() => {
    if (!gDataForVis) return [];
    if (globalVizKind === "tree") {
      return buildHierarchyVisNodes(gDataForVis, selGlobal, showLabels, colorClusters, globalTreeHierarchyOptions);
    }
    return buildOverviewNodes(gDataForVis, selGlobal, showLabels, colorClusters);
  }, [gDataForVis, globalVizKind, selGlobal, showLabels, colorClusters, globalTreeHierarchyOptions]);

  const gEdges = useMemo(() => {
    if (!gDataForVis) return [];
    if (globalVizKind === "tree") {
      return buildHierarchyVisEdges(gDataForVis, selGlobal, isDark);
    }
    return buildOverviewEdges(gDataForVis, selGlobal, showInferred, isDark);
  }, [gDataForVis, globalVizKind, selGlobal, showInferred, isDark]);

  const gStats = gDataForVis ? computeGraphStats(gDataForVis) : null;

  const exportPng = (key: string, filename: string) => {
    const fn = (window as unknown as Record<string, (() => string | null) | undefined>)[key];
    const dataUrl = fn?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const globalTitle = gData?.nodeMap.get(selGlobal ?? -1)?.label;

  return (
    <div className="library-page" data-theme={isDark ? "dark" : "light"}>
      <section className="library-hero">
        <div className="library-hero-inner">
          <div className="library-hero-copy">
            <p className="library-kicker">Supabase</p>
            <h2 className="library-title">Research library</h2>
            <p className="library-sub">
              Load saved global graphs and reports from your database. Table:{" "}
              <code className="library-code">{tableName}</code>
            </p>
          </div>
          <div className="library-hero-actions">
            <button type="button" className="library-btn primary" onClick={load} disabled={loading || !configured}>
              {loading ? "Fetching…" : "Fetch from database"}
            </button>
            {!configured && (
              <span className="library-config-hint">Configure env keys to enable fetch.</span>
            )}
          </div>
        </div>
        {fetchError && <div className="library-banner error">{fetchError}</div>}
        {rows.length > 0 && (
          <div className="library-cards" role="listbox" aria-label="Research questions">
            {rows.map((row) => {
              const active = row.id === selectedRowId;
              const label = row.research_question?.trim() || row.slug || `Project ${row.id.slice(0, 8)}…`;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`library-card ${active ? "active" : ""}`}
                  onClick={() => onSelectRow(row.id)}
                >
                  <span className="library-card-title">{label}</span>
                  <span className="library-card-meta">
                    {row.slug} · {formatWhen(row.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <div className="library-detail">
          <header className="library-detail-header">
            <h3 className="library-detail-question">
              {selected.research_question?.trim() || "Untitled research question"}
            </h3>
            <p className="library-detail-slug">{selected.slug}</p>
          </header>

          <div className="library-detail-grid">
            <article className="library-report glass-panel">
              <div className="library-panel-head">
                <span className="library-panel-icon">◆</span>
                <h4>Report</h4>
              </div>
              <div className="library-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.report_markdown || "_No report text._"}</ReactMarkdown>
              </div>
            </article>

            <article className="library-graph-panel library-graph-panel--primary glass-panel">
                <div className="library-panel-head">
                  <span className="library-panel-icon">◎</span>
                  <h4>Global graph</h4>
                  <div className="library-panel-tools">
                    {globalVizKind === "edges" && (
                      <label className="library-mini-check">
                        <input
                          type="checkbox"
                          checked={showInferred}
                          onChange={(e) => setShowInferred(e.target.checked)}
                        />
                        Inferred
                      </label>
                    )}
                    <label
                      className="library-mini-check"
                      title={
                        globalVizKind === "tree"
                          ? "On: name on every node. Off: root, branch nodes, and selection only — hover for full text on leaves."
                          : "Show node names on the canvas"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={(e) => setShowLabels(e.target.checked)}
                      />
                      Labels
                    </label>
                    <label className="library-mini-check">
                      <input
                        type="checkbox"
                        checked={colorClusters}
                        onChange={(e) => setColorClusters(e.target.checked)}
                      />
                      Clusters
                    </label>
                    <button
                      type="button"
                      className="library-mini-btn"
                      onClick={() => exportPng("__graphExport_libraryGlobal", `global-graph-${selected.slug}.png`)}
                    >
                      Export
                    </button>
                  </div>
                </div>
                {globalParsed.error && <div className="library-parse-error">{globalParsed.error}</div>}
                {globalVizKind === "tree" && gData && !globalParsed.error && treeRootId != null && (
                  <div className="library-drill-bar">
                    <button
                      type="button"
                      className="library-drill-btn"
                      onClick={handleGlobalTreeReset}
                      title="Collapse to root and its first level only"
                    >
                      Reset view
                    </button>
                    <label className="library-mini-check library-drill-check">
                      <input
                        type="checkbox"
                        checked={omitTopParent}
                        onChange={(e) => setOmitTopParent(e.target.checked)}
                      />
                      Themes as roots
                    </label>
                    <span className="library-drill-meta">
                      {gDataForVis?.nodeCount ?? 0} nodes visible · {globalExpandedIds.size} expanded branch
                      {globalExpandedIds.size === 1 ? "" : "es"}
                      {treeStripApplied ? " · top topic omitted in view" : ""} · click to expand/collapse
                    </span>
                  </div>
                )}
                {gDataForVis && gStats && (
                  <>
                    <div className="library-graph-mount">
                      <GraphView
                        key={`lib-g-${selected.id}-${globalVizKind ?? "x"}`}
                        layoutEngine={globalVizKind === "tree" ? "hierarchical" : "force"}
                        hierarchicalSpacing={globalVizKind === "tree" ? globalHierarchicalSpacing : undefined}
                        nodes={gNodes}
                        edges={gEdges}
                        mode={globalVizKind === "tree" ? "hierarchy" : "overview"}
                        onNodeSelect={globalVizKind === "tree" ? handleGlobalNodeSelect : setSelGlobal}
                        fitOnStabilized={true}
                        exportWindowKey="__graphExport_libraryGlobal"
                      />
                    </div>
                    <div className="library-stats-inline">
                      <StatsPanel
                        nodeCount={gStats.nodeCount}
                        edgeCount={gStats.edgeCount}
                        componentCount={gStats.componentCount}
                        density={gStats.density}
                        maxDegree={gStats.maxDegree}
                        directEdges={gStats.directEdgeCount}
                        inferredEdges={gStats.inferredEdgeCount}
                        viewMode="overview"
                      />
                    </div>
                    <p className="library-node-hint">
                      {globalVizKind === "tree" ? (
                        <>
                          {globalTitle ? <>Highlighted: {globalTitle}</> : null}
                          {globalTitle ? " · " : null}
                          Click a node with children to <strong>expand</strong> or <strong>collapse</strong>.{" "}
                          {treeStripApplied
                            ? "Uncheck 'Themes as roots' to show the original top topic again."
                            : "Ancestors stay visible."}
                        </>
                      ) : globalTitle ? (
                        <>Selected: {globalTitle}</>
                      ) : (
                        <>Click a node.</>
                      )}
                    </p>
                  </>
                )}
            </article>
          </div>
        </div>
      )}

      {rows.length === 0 && !loading && !fetchError && configured && (
        <div className="library-empty glass-panel">
          <p>Nothing loaded yet. Press <strong>Fetch from database</strong> to load rows.</p>
        </div>
      )}
    </div>
  );
}
