import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchResearchProjects } from "../lib/fetchResearchProjects";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  buildGraphData,
  buildOverviewEdges,
  buildOverviewNodes,
  GRAPH_CLUSTER_HEXES,
} from "../lib/graphBuilder";
import { buildHierarchyVisEdges, buildHierarchyVisNodes } from "../lib/hierarchicalGraphBuilder";
import { buildHierarchyGraphFromThemeTree, isThemeTreeDocument } from "../lib/themeTree";
import { computeFlowerPositions } from "../lib/flowerLayout";
import {
  buildParentMapFromEdges,
  collectDescendantOpenCodeLeaves,
  computeDirectedDepthFromRoot,
  findDirectedTreeRootId,
  isOpenCodeCorpusNode,
  MAX_DESCENDANT_LEAVES_FOR_CORPUS,
  remapDepthsAfterStrippingRoot,
  removeExpandedSubtreeFromSet,
  sliceExpandedTree,
  stripTreeRootFromGraph,
} from "../lib/treeDrilldown";
import type { CodebookJson, GraphData, GraphNode, ResearchProjectRow } from "../types";
import type { OpenCodeEvidenceRow } from "../lib/openCodesEvidence";
import { extractEvidenceForCode } from "../lib/openCodesEvidence";
import {
  buildCooccurrenceVisInput,
  parseCooccurrencePayload,
  type CooccurrenceLayer,
} from "../lib/cooccurrence";
import { CooccurrenceNetworkView } from "./CooccurrenceNetworkView";
import { GraphView } from "./GraphView";
import { OpenCodesTracePanel } from "./OpenCodesTracePanel";

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

function rowLabel(row: ResearchProjectRow): string {
  return row.research_question?.trim() || row.slug || `Project ${row.id.slice(0, 8)}…`;
}

function rowOptionLabel(row: ResearchProjectRow): string {
  const s = rowLabel(row);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
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
  const [cooccurrenceLayer, setCooccurrenceLayer] = useState<CooccurrenceLayer>("meta");
  const [cooccurrenceMaxEdges, setCooccurrenceMaxEdges] = useState(80);
  const [cooccurrenceMinCount, setCooccurrenceMinCount] = useState(1);

  const configured = isSupabaseConfigured();

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
      return buildHierarchyVisEdges(gDataForVis, selGlobal, isDark, {
        ...(globalTreeHierarchyOptions ?? {}),
        colorClusters,
      });
    }
    return buildOverviewEdges(gDataForVis, selGlobal, showInferred, isDark);
  }, [
    gDataForVis,
    globalVizKind,
    selGlobal,
    showInferred,
    isDark,
    globalTreeHierarchyOptions,
    colorClusters,
  ]);

  const flowerPositions = useMemo(() => {
    if (globalVizKind !== "tree" || !gDataForVis) return null;
    const themeStripBoost =
      treeStripApplied && gDataForVis.edgeCount === 0 && gDataForVis.nodeCount > 0;
    return computeFlowerPositions(gDataForVis, { themeStripBoost });
  }, [globalVizKind, gDataForVis, treeStripApplied]);

  const gNodesForGraph = useMemo(() => {
    if (!flowerPositions?.size || !gNodes.length) return gNodes;
    return gNodes.map((node) => {
      const p = flowerPositions.get(node.id);
      if (!p) return node;
      return { ...node, x: p.x, y: p.y };
    });
  }, [gNodes, flowerPositions]);

  const gEdgesForGraph = useMemo(() => {
    if (globalVizKind !== "tree") return gEdges;
    return gEdges.map((e) => ({
      ...e,
      smooth: { enabled: true, type: "dynamic" as const, roundness: 0.45 },
    }));
  }, [gEdges, globalVizKind]);

  /** Theme-tree / hierarchical exports attach roles; plain edge graphs do not. */
  const graphHasHierarchyRoles = useMemo(() => {
    if (!gDataForVis) return false;
    return gDataForVis.nodes.some((n) => n.hierarchyRole != null);
  }, [gDataForVis]);

  const traceNode = useMemo(() => {
    if (selGlobal == null || !gDataForVis) return null;
    return gDataForVis.nodeMap.get(selGlobal) ?? null;
  }, [selGlobal, gDataForVis]);

  /** Corpus for open-code leaves, themes, and sub-themes (parents aggregate descendant codes). */
  const traceEligible = useMemo(() => {
    if (selGlobal == null || !gDataForVis || !gData) return false;
    const n = gDataForVis.nodeMap.get(selGlobal);
    if (!n) return false;
    if (globalVizKind === "tree" || graphHasHierarchyRoles) {
      return (
        isOpenCodeCorpusNode(gData, n) ||
        n.hierarchyRole === "theme" ||
        n.hierarchyRole === "sub_theme" ||
        gData.edges.some((e) => e.from === n.id)
      );
    }
    return true;
  }, [selGlobal, gDataForVis, gData, globalVizKind, graphHasHierarchyRoles]);

  const traceDirectParentLabel = useMemo(() => {
    if (!gData || !traceNode || !isOpenCodeCorpusNode(gData, traceNode)) return null;
    const pm = buildParentMapFromEdges(gData.edges);
    const pid = pm.get(traceNode.id);
    if (pid == null) return null;
    return gData.nodeMap.get(pid)?.label ?? null;
  }, [gData, traceNode]);

  const traceEvidenceBundle = useMemo((): {
    groups: { leaf: GraphNode; rows: OpenCodeEvidenceRow[] }[];
    evidenceMeta: { truncated: boolean; totalLeaves: number; shownCount: number } | null;
  } => {
    const md = selected?.open_codes_markdown;
    if (!traceNode || !md?.trim() || !gDataForVis) {
      return { groups: [], evidenceMeta: null };
    }

    const rowsForLeaf = (leaf: GraphNode) => {
      const fromLabel = extractEvidenceForCode(md, leaf.label);
      if (fromLabel.length > 0) return fromLabel;
      return extractEvidenceForCode(md, leaf.title);
    };

    if (globalVizKind !== "tree" && !graphHasHierarchyRoles) {
      const rows = rowsForLeaf(traceNode);
      return {
        groups: [{ leaf: traceNode, rows }],
        evidenceMeta: { truncated: false, totalLeaves: 1, shownCount: 1 },
      };
    }

    if (!gData) {
      return { groups: [], evidenceMeta: null };
    }

    if (isOpenCodeCorpusNode(gData, traceNode)) {
      return {
        groups: [{ leaf: traceNode, rows: rowsForLeaf(traceNode) }],
        evidenceMeta: { truncated: false, totalLeaves: 1, shownCount: 1 },
      };
    }

    const allLeaves = collectDescendantOpenCodeLeaves(gData, traceNode.id);
    const shown = allLeaves.slice(0, MAX_DESCENDANT_LEAVES_FOR_CORPUS);
    const truncated = allLeaves.length > MAX_DESCENDANT_LEAVES_FOR_CORPUS;
    return {
      groups: shown.map((leaf) => ({ leaf, rows: rowsForLeaf(leaf) })),
      evidenceMeta: {
        truncated,
        totalLeaves: allLeaves.length,
        shownCount: shown.length,
      },
    };
  }, [selected?.open_codes_markdown, traceNode, gData, gDataForVis, globalVizKind, graphHasHierarchyRoles]);

  const cooccurrenceParsed = useMemo(
    () => parseCooccurrencePayload(selected?.cooccurrence),
    [selected?.cooccurrence]
  );

  const cooccurrenceVis = useMemo(() => {
    if (!cooccurrenceParsed.ok) return null;
    return buildCooccurrenceVisInput(cooccurrenceParsed.data, cooccurrenceLayer, {
      maxEdges: cooccurrenceMaxEdges,
      minCount: cooccurrenceMinCount,
    });
  }, [cooccurrenceParsed, cooccurrenceLayer, cooccurrenceMaxEdges, cooccurrenceMinCount]);

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
      <div className="library-shell">
        <div className="library-toolbar-min glass-panel">
          <div className="library-toolbar-min-row">
            <button
              type="button"
              className="library-btn library-btn--primary library-btn--sync"
              onClick={load}
              disabled={loading || !configured}
            >
              {loading ? "Loading…" : "Sync from database"}
            </button>
            {rows.length > 0 && (
              <>
                <label className="library-toolbar-label" htmlFor="library-rq-select">
                  Project
                </label>
                <select
                  id="library-rq-select"
                  className="library-select library-select--toolbar"
                  value={selectedRowId ?? ""}
                  onChange={(e) => onSelectRow(e.target.value || null)}
                  aria-label="Choose research project"
                >
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {rowOptionLabel(row)}
                    </option>
                  ))}
                </select>
                {selected ? (
                  <div className="library-toolbar-chips" aria-label="Project metadata">
                    <span className="library-chip" title="Row slug">
                      {selected.slug}
                    </span>
                    <span className="library-chip library-chip--muted" title="Loaded at">
                      {formatWhen(selected.created_at)}
                    </span>
                  </div>
                ) : null}
              </>
            )}
            {!configured && (
              <p className="library-config-hint library-config-hint--inline">
                Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
              </p>
            )}
          </div>
        </div>
        {fetchError && (
          <div className="library-banner library-banner--error" role="alert">
            {fetchError}
          </div>
        )}

      {selected && (
        <div className="library-detail library-detail--graph">
          <div className="library-context-bar glass-panel">
            <div className="library-context-info">
              <span className="library-context-label">Now viewing</span>
              <p className="library-context-rq" title={rowLabel(selected)}>
                {rowLabel(selected)}
              </p>
            </div>
          </div>

          <div className="library-workspace">
          <aside className="library-report-inline glass-panel" aria-label="Research report">
            <div className="library-report-inline-head">
              <span className="library-panel-icon" aria-hidden="true">
                ◆
              </span>
              <h4 id="library-report-heading">Research report</h4>
            </div>
            <div className="library-markdown library-markdown--inline">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selected.report_markdown || "_No report text._"}
              </ReactMarkdown>
            </div>
          </aside>

          <article className="library-graph-panel library-graph-panel--primary glass-panel">
                <div className="library-panel-head">
                  <div className="library-panel-head-text">
                    <span className="library-panel-icon" aria-hidden="true">
                      ◎
                    </span>
                    <div>
                      <h4>Theme graph</h4>
                      <p className="library-panel-sub">Interactive view of your exported global_graph</p>
                    </div>
                  </div>
                  <div className="library-panel-tools" role="toolbar" aria-label="Graph display options">
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
                      <strong>{gDataForVis?.nodeCount ?? 0}</strong> nodes visible · <strong>{globalExpandedIds.size}</strong> expanded branch{globalExpandedIds.size === 1 ? "" : "es"}
                      {treeStripApplied ? " · top topic omitted" : ""} · radial layout
                    </span>
                  </div>
                )}
                {gDataForVis && (
                  <>
                    <div className="library-graph-mount library-graph-mount--fill">
                      <GraphView
                        key={`lib-g-${selected.id}-${globalVizKind ?? "x"}`}
                        layoutEngine={globalVizKind === "tree" ? "flower" : "force"}
                        nodes={gNodesForGraph}
                        edges={gEdgesForGraph}
                        mode={globalVizKind === "tree" ? "hierarchy" : "overview"}
                        onNodeSelect={globalVizKind === "tree" ? handleGlobalNodeSelect : setSelGlobal}
                        fitOnStabilized={true}
                        exportWindowKey="__graphExport_libraryGlobal"
                      />
                      {colorClusters && gDataForVis && gDataForVis.nodeCount > 0 && (
                        <div className="graph-legend">
                          <span className="graph-legend-title">
                            {globalVizKind === "tree" ? "Themes" : "Clusters"}
                          </span>
                          {(() => {
                            const seen = new Map<number, string>();
                            for (const n of gDataForVis.nodes) {
                              if (!seen.has(n.componentId)) {
                                seen.set(n.componentId, n.hierarchyRole === "theme" || n.hierarchyRole === "sub_theme" ? n.label : `Group ${n.componentId + 1}`);
                              }
                              if (seen.size >= 6) break;
                            }
                            // For tree viz, show the top-level theme names
                            if (globalVizKind === "tree") {
                              const themes = gDataForVis.nodes.filter(n => {
                                const d = globalTreeDepthByNode?.get(n.id);
                                return d === 0;
                              }).slice(0, 6);
                              if (themes.length > 0) {
                                return themes.map((n, i) => (
                                  <div key={n.id} className="graph-legend-item">
                                    <span
                                      className={`graph-legend-swatch ${i === 0 ? "graph-legend-swatch--lg" : ""}`}
                                      style={{ background: GRAPH_CLUSTER_HEXES[i % GRAPH_CLUSTER_HEXES.length] }}
                                    />
                                    <span className="graph-legend-label">
                                      {n.label.length > 24 ? n.label.slice(0, 22) + "…" : n.label}
                                    </span>
                                  </div>
                                ));
                              }
                            }
                            return Array.from(seen.entries()).map(([compId, label]) => (
                              <div key={compId} className="graph-legend-item">
                                <span
                                  className="graph-legend-swatch"
                                  style={{ background: GRAPH_CLUSTER_HEXES[compId % GRAPH_CLUSTER_HEXES.length] }}
                                />
                                <span className="graph-legend-label">
                                  {label.length > 24 ? label.slice(0, 22) + "…" : label}
                                </span>
                              </div>
                            ));
                          })()}
                          <span className="graph-legend-hint">
                            {globalVizKind === "tree" ? "Click nodes to expand" : "Node size = connections"}
                          </span>
                        </div>
                      )}
                    </div>
                    <OpenCodesTracePanel
                      selectedNode={traceNode}
                      markdownAvailable={Boolean(selected?.open_codes_markdown?.trim())}
                      treeMode={globalVizKind === "tree" || graphHasHierarchyRoles}
                      traceEligible={traceEligible}
                      directParentLabel={traceDirectParentLabel}
                      evidenceGroups={traceEvidenceBundle.groups}
                      evidenceMeta={traceEvidenceBundle.evidenceMeta}
                    />
                    <p className="library-node-hint">
                      {globalVizKind === "tree" ? (
                        <>
                          {globalTitle ? <>Selected: <strong>{globalTitle}</strong></> : null}
                          {globalTitle ? " · " : null}
                          Click a node to expand or collapse its children. Drag to rearrange.
                        </>
                      ) : globalTitle ? (
                        <>Selected: <strong>{globalTitle}</strong> · Scroll to zoom, drag to pan</>
                      ) : (
                        <>Click a node to see details. Scroll to zoom, drag to pan.</>
                      )}
                    </p>
                  </>
                )}
          </article>

          <article
            className="library-graph-panel library-graph-panel--cooccurrence glass-panel"
            aria-label="Theme co-occurrence network"
          >
            <div className="library-panel-head">
              <div className="library-panel-head-text">
                <span className="library-panel-icon" aria-hidden="true">
                  ⬡
                </span>
                <div>
                  <h4>Theme co-occurrence</h4>
                  <p className="library-panel-sub">
                    Which themes or meta-themes tend to appear in the same review.
                  </p>
                </div>
              </div>
              <div className="library-panel-tools cooccurrence-toolbar" role="toolbar" aria-label="Co-occurrence options">
                <label className="library-toolbar-label library-toolbar-label--compact" htmlFor="library-coocc-layer">
                  Layer
                </label>
                <select
                  id="library-coocc-layer"
                  className="library-select library-select--toolbar"
                  value={cooccurrenceLayer}
                  onChange={(e) => setCooccurrenceLayer(e.target.value as CooccurrenceLayer)}
                  aria-label="Co-occurrence layer"
                >
                  <option value="meta">Meta-themes</option>
                  <option value="theme">Themes</option>
                </select>
                <label className="library-toolbar-label library-toolbar-label--compact" htmlFor="library-coocc-max">
                  Max edges
                </label>
                <select
                  id="library-coocc-max"
                  className="library-select library-select--toolbar"
                  value={cooccurrenceMaxEdges}
                  onChange={(e) => setCooccurrenceMaxEdges(Number(e.target.value))}
                  aria-label="Maximum edges to show"
                >
                  <option value={40}>40</option>
                  <option value={80}>80</option>
                  <option value={150}>150</option>
                  <option value={300}>300</option>
                </select>
                <label className="library-toolbar-label library-toolbar-label--compact" htmlFor="library-coocc-min">
                  Min count
                </label>
                <select
                  id="library-coocc-min"
                  className="library-select library-select--toolbar"
                  value={cooccurrenceMinCount}
                  onChange={(e) => setCooccurrenceMinCount(Number(e.target.value))}
                  aria-label="Minimum co-occurrence count"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
                {cooccurrenceParsed.ok ? (
                  <button
                    type="button"
                    className="library-mini-btn"
                    disabled={!cooccurrenceVis || cooccurrenceVis.edges.length === 0}
                    onClick={() =>
                      exportPng("__graphExport_libraryCooccurrence", `cooccurrence-${selected?.slug ?? "graph"}.png`)
                    }
                  >
                    Export
                  </button>
                ) : null}
              </div>
            </div>
            {!cooccurrenceParsed.ok ? (
              <div className="library-cooccurrence-empty" role="status">
                <p className="library-cooccurrence-empty-title">No co-occurrence data</p>
                <p className="library-cooccurrence-empty-body">{cooccurrenceParsed.error}</p>
              </div>
            ) : cooccurrenceVis && cooccurrenceVis.edges.length === 0 ? (
              <div className="library-cooccurrence-empty" role="status">
                <p className="library-cooccurrence-empty-title">No edges match filters</p>
                <p className="library-cooccurrence-empty-body">
                  Try lowering <strong>Min count</strong> or raising <strong>Max edges</strong>, or switch layer.
                </p>
              </div>
            ) : cooccurrenceVis && cooccurrenceVis.edges.length > 0 ? (
              <>
                <div className="library-graph-mount library-graph-mount--fill library-graph-mount--cooccurrence">
                  <CooccurrenceNetworkView
                    key={`${selected?.id}-${cooccurrenceLayer}-${cooccurrenceMaxEdges}-${cooccurrenceMinCount}`}
                    nodes={cooccurrenceVis.nodes}
                    edges={cooccurrenceVis.edges}
                    isDark={isDark}
                    exportWindowKey="__graphExport_libraryCooccurrence"
                  />
                </div>
                <p className="library-node-hint library-node-hint--cooccurrence">
                  Undirected network: edge weight reflects how often two labels co-occur in the same review.
                  {cooccurrenceVis.totalReviews > 0 ? (
                    <>
                      {" "}
                      Corpus: <strong>{cooccurrenceVis.totalReviews.toLocaleString()}</strong> reviews.
                    </>
                  ) : null}
                </p>
              </>
            ) : null}
          </article>
          </div>
        </div>
      )}

      {rows.length === 0 && !loading && !fetchError && configured && (
        <div className="library-empty library-empty--cta glass-panel">
          <p className="library-empty-title">No rows in memory</p>
          <p className="library-empty-body">
            Use <strong>Sync from database</strong> above to load projects from Supabase, then choose one to open the
            graph.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
