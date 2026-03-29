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
import {
  buildHierarchicalGraphData,
  buildHierarchyVisEdges,
  buildHierarchyVisNodes,
  isHierarchicalCodebookJson,
} from "../lib/hierarchicalGraphBuilder";
import type { CodebookJson, GraphData, ResearchProjectRow } from "../types";
import { GraphView } from "./GraphView";
import { StatsPanel } from "./StatsPanel";

interface LibraryViewProps {
  selectedRowId: string | null;
  onSelectRow: (id: string | null) => void;
  isDark: boolean;
}

function tryParseGlobalGraph(raw: unknown): { data: GraphData | null; error: string | null } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: null, error: "global_graph is missing or not an object." };
  }
  const o = raw as CodebookJson;
  const hasEdges = Array.isArray(o.edges) && o.edges.length > 0;
  const hasInferred = Array.isArray(o.inferred_edges) && o.inferred_edges.length > 0;
  if (!hasEdges && !hasInferred) {
    return { data: null, error: "global_graph needs non-empty edges or inferred_edges." };
  }
  try {
    return { data: buildGraphData(o), error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

function tryParseCodebookTree(raw: unknown): { data: GraphData | null; error: string | null } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: null, error: "codebook is missing or not an object." };
  }
  if (!isHierarchicalCodebookJson(raw)) {
    return {
      data: null,
      error: "codebook is not in hierarchical format (theme → sub_themes → codes).",
    };
  }
  try {
    const data = buildHierarchicalGraphData(raw);
    if (data.nodeCount === 0) return { data: null, error: "codebook has no clusters." };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
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
  const [showLabels, setShowLabels] = useState(false);
  const [colorClusters, setColorClusters] = useState(true);
  const [showInferred, setShowInferred] = useState(true);
  const [selHierarchy, setSelHierarchy] = useState<number | null>(null);
  const [selGlobal, setSelGlobal] = useState<number | null>(null);

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

  const hierarchyParsed = useMemo(
    () => (selected ? tryParseCodebookTree(selected.codebook) : { data: null, error: null }),
    [selected]
  );

  const globalParsed = useMemo(
    () => (selected ? tryParseGlobalGraph(selected.global_graph) : { data: null, error: null }),
    [selected]
  );

  const hData = hierarchyParsed.data;
  const gData = globalParsed.data;

  useEffect(() => {
    if (hData) {
      const t = hData.nodes.find((n) => n.hierarchyRole === "theme");
      setSelHierarchy(t?.id ?? hData.nodes[0]?.id ?? null);
    } else setSelHierarchy(null);
  }, [hData, selectedRowId]);

  useEffect(() => {
    if (gData) {
      const top = gData.nodes.slice().sort((a, b) => b.degree - a.degree)[0];
      setSelGlobal(top?.id ?? null);
    } else setSelGlobal(null);
  }, [gData, selectedRowId]);

  const hNodes = useMemo(
    () =>
      hData ? buildHierarchyVisNodes(hData, selHierarchy, showLabels, colorClusters) : [],
    [hData, selHierarchy, showLabels, colorClusters]
  );
  const hEdges = useMemo(
    () => (hData ? buildHierarchyVisEdges(hData, selHierarchy, isDark) : []),
    [hData, selHierarchy, isDark]
  );

  const gNodes = useMemo(
    () => (gData ? buildOverviewNodes(gData, selGlobal, showLabels, colorClusters) : []),
    [gData, selGlobal, showLabels, colorClusters]
  );
  const gEdges = useMemo(
    () => (gData ? buildOverviewEdges(gData, selGlobal, showInferred, isDark) : []),
    [gData, selGlobal, showInferred, isDark]
  );

  const gStats = gData ? computeGraphStats(gData) : null;

  const exportPng = (key: string, filename: string) => {
    const fn = (window as unknown as Record<string, (() => string | null) | undefined>)[key];
    const dataUrl = fn?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const hierarchyTitle = hData?.nodeMap.get(selHierarchy ?? -1)?.label;
  const globalTitle = gData?.nodeMap.get(selGlobal ?? -1)?.label;

  return (
    <div className="library-page" data-theme={isDark ? "dark" : "light"}>
      <section className="library-hero">
        <div className="library-hero-inner">
          <div className="library-hero-copy">
            <p className="library-kicker">Supabase</p>
            <h2 className="library-title">Research library</h2>
            <p className="library-sub">
              Load saved codebooks, global graphs, and reports from your database. Table:{" "}
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

            <div className="library-graphs">
              <article className="library-graph-panel glass-panel">
                <div className="library-panel-head">
                  <span className="library-panel-icon">◇</span>
                  <h4>Codebook hierarchy</h4>
                  <div className="library-panel-tools">
                    <label className="library-mini-check">
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
                      onClick={() => exportPng("__graphExport_libraryHierarchy", `codebook-${selected.slug}.png`)}
                    >
                      Export
                    </button>
                  </div>
                </div>
                {hierarchyParsed.error && (
                  <div className="library-parse-error">{hierarchyParsed.error}</div>
                )}
                {hData && (
                  <>
                    <div className="library-graph-mount">
                      <GraphView
                        nodes={hNodes}
                        edges={hEdges}
                        mode="hierarchy"
                        onNodeSelect={setSelHierarchy}
                        fitOnStabilized={true}
                        exportWindowKey="__graphExport_libraryHierarchy"
                      />
                    </div>
                    <p className="library-node-hint">
                      {hierarchyTitle ? <>Selected: {hierarchyTitle}</> : <>Click a node for details.</>}
                    </p>
                  </>
                )}
              </article>

              <article className="library-graph-panel glass-panel">
                <div className="library-panel-head">
                  <span className="library-panel-icon">◎</span>
                  <h4>Global graph</h4>
                  <div className="library-panel-tools">
                    <label className="library-mini-check">
                      <input
                        type="checkbox"
                        checked={showInferred}
                        onChange={(e) => setShowInferred(e.target.checked)}
                      />
                      Inferred
                    </label>
                    <label className="library-mini-check">
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
                {gData && gStats && (
                  <>
                    <div className="library-graph-mount">
                      <GraphView
                        nodes={gNodes}
                        edges={gEdges}
                        mode="overview"
                        onNodeSelect={setSelGlobal}
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
                      {globalTitle ? <>Selected: {globalTitle}</> : <>Click a node.</>}
                    </p>
                  </>
                )}
              </article>
            </div>
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
