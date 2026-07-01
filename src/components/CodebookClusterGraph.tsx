import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClusterFocusDashboard, FocusClusterScreenLabel } from "./ClusterFocusDashboard";
import { CodebookCluster2D } from "./CodebookCluster2D";
import { CodebookCluster3D } from "./CodebookCluster3D";
import type { HighlightedCode } from "./codebookClusterTypes";
import { isLargeCodebookDataset } from "../lib/codebookClusterLayout3d";
import { isDenseCodebookLayout } from "../lib/codebookClusterLayout2d";
import type { ClusterEntry } from "../lib/codebookReview";

export type CodebookGraphDimension = "2d" | "3d";

const FOCUS_CODE_REMOVE_MS = 280;

interface CodebookClusterGraphProps {
  sortedClusterIds: string[];
  clusterToCodes: Record<string, string[]>;
  clusterColor: Map<string, string>;
  clusters: Record<string, ClusterEntry>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onExpandedClustersChange?: (clusterIds: string[]) => void;
  isSmallCodebook?: boolean;
  totalClusterCount?: number;
  isDark: boolean;
}

export function CodebookClusterGraph({
  sortedClusterIds,
  clusterToCodes,
  clusterColor,
  clusters,
  highlighted,
  onSelectCode,
  onClearSelection,
  onMoveCode,
  onExpandedClustersChange,
  isSmallCodebook = false,
  totalClusterCount,
  isDark,
}: CodebookClusterGraphProps) {
  const [dimension, setDimension] = useState<CodebookGraphDimension>("3d");
  const [expandedClusterIds, setExpandedClusterIds] = useState<Set<string>>(new Set());
  const [clusterFocusId, setClusterFocusId] = useState<string | null>(null);
  const [focusTransitioning, setFocusTransitioning] = useState(false);
  const [lingerFocusClusterId, setLingerFocusClusterId] = useState<string | null>(null);
  const [focusRemovingCode, setFocusRemovingCode] = useState<string | null>(null);
  const focusRemoveTimer = useRef<number | null>(null);

  const showFocusChrome = clusterFocusId != null || focusTransitioning;
  const showDashboard = clusterFocusId != null;

  const syncExpanded = useCallback(
    (ids: string[]) => {
      setExpandedClusterIds(new Set(ids));
      onExpandedClustersChange?.(ids);
    },
    [onExpandedClustersChange]
  );

  const handleToggleCluster = useCallback(
    (clusterId: string) => {
      if (!clusterId) {
        setExpandedClusterIds(new Set());
        onExpandedClustersChange?.([]);
        onClearSelection();
        return;
      }
      setExpandedClusterIds((prev) => {
        const next = new Set(prev);
        if (next.has(clusterId)) next.delete(clusterId);
        else next.add(clusterId);
        onExpandedClustersChange?.([...next]);
        return next;
      });
    },
    [onClearSelection, onExpandedClustersChange]
  );

  useEffect(() => {
    setExpandedClusterIds(new Set());
    setClusterFocusId(null);
    setFocusTransitioning(false);
    setLingerFocusClusterId(null);
    setFocusRemovingCode(null);
    if (focusRemoveTimer.current) {
      window.clearTimeout(focusRemoveTimer.current);
      focusRemoveTimer.current = null;
    }
  }, [sortedClusterIds.join("|"), isSmallCodebook]);

  useEffect(() => {
    if (dimension !== "3d") {
      setClusterFocusId(null);
      setFocusTransitioning(false);
      setLingerFocusClusterId(null);
    }
  }, [dimension]);

  const handleFocusTransitionPhase = useCallback((phase: "idle" | "running") => {
    setFocusTransitioning(phase === "running");
  }, []);

  useEffect(() => {
    if (clusterFocusId) {
      setLingerFocusClusterId(clusterFocusId);
      return;
    }
    if (!focusTransitioning) setLingerFocusClusterId(null);
  }, [clusterFocusId, focusTransitioning]);

  const handleSelectCode = useCallback(
    (code: string, clusterId: string) => {
      onSelectCode(code, clusterId);
    },
    [onSelectCode]
  );

  const handleFocusCluster = useCallback(
    (code: string, clusterId: string) => {
      onSelectCode(code, clusterId);
      if (dimension === "3d") setClusterFocusId(clusterId);
    },
    [dimension, onSelectCode]
  );

  const exitClusterFocus = useCallback(() => {
    setClusterFocusId(null);
    onClearSelection();
  }, [onClearSelection]);

  useEffect(() => {
    return () => {
      if (focusRemoveTimer.current) window.clearTimeout(focusRemoveTimer.current);
    };
  }, []);

  const handleRequestMoveCode = useCallback(
    (code: string, fromClusterId: string, toClusterId: string) => {
      if (!onMoveCode || fromClusterId === toClusterId) return;
      if (focusRemoveTimer.current) window.clearTimeout(focusRemoveTimer.current);
      setFocusRemovingCode(code);
      focusRemoveTimer.current = window.setTimeout(() => {
        onMoveCode(code, fromClusterId, toClusterId);
        onClearSelection();
        setFocusRemovingCode(null);
        focusRemoveTimer.current = null;
      }, FOCUS_CODE_REMOVE_MS);
    },
    [onMoveCode, onClearSelection]
  );

  const focusEntry = clusterFocusId ? clusters[clusterFocusId] : null;
  const focusCodes = clusterFocusId ? (clusterToCodes[clusterFocusId] ?? []) : [];
  const focusColor = clusterFocusId ? (clusterColor.get(clusterFocusId) ?? "#7cf0d0") : "#7cf0d0";
  const screenLabelClusterId = lingerFocusClusterId ?? clusterFocusId;
  const screenLabelEntry = screenLabelClusterId ? clusters[screenLabelClusterId] : null;
  const screenLabelCodes = screenLabelClusterId ? (clusterToCodes[screenLabelClusterId] ?? []) : [];
  const screenLabelColor = screenLabelClusterId
    ? (clusterColor.get(screenLabelClusterId) ?? "#7cf0d0")
    : "#7cf0d0";

  const denseLayout = useMemo(
    () => isDenseCodebookLayout(sortedClusterIds, clusterToCodes),
    [sortedClusterIds, clusterToCodes]
  );
  const usesExpandCollapse =
    denseLayout || (!isSmallCodebook && isLargeCodebookDataset(totalClusterCount ?? sortedClusterIds.length));

  const overviewMode = usesExpandCollapse && expandedClusterIds.size === 0;

  const sharedProps = {
    sortedClusterIds,
    clusterToCodes,
    clusterColor,
    clusters,
    highlighted,
    onSelectCode: handleSelectCode,
    onClearSelection,
    onMoveCode,
    onExpandedClustersChange: syncExpanded,
    expandedClusterIds,
    isSmallCodebook,
    totalClusterCount,
    isDark,
  };

  return (
    <div
      className={`codebook-3d-canvas-wrap glass-panel ${showFocusChrome && dimension === "3d" ? "codebook-3d-canvas-wrap--focus" : ""}`}
    >
      <div className="codebook-3d-canvas-head">
        <div className="codebook-graph-head-main">
          <h4>Cluster map</h4>
          <div className="codebook-graph-dimension-toggle" role="tablist" aria-label="Graph dimension">
            <button
              type="button"
              role="tab"
              aria-selected={dimension === "2d"}
              className={`codebook-graph-dimension-btn ${dimension === "2d" ? "codebook-graph-dimension-btn--active" : ""}`}
              onClick={() => setDimension("2d")}
            >
              2D
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dimension === "3d"}
              className={`codebook-graph-dimension-btn ${dimension === "3d" ? "codebook-graph-dimension-btn--active" : ""}`}
              onClick={() => setDimension("3d")}
            >
              3D
            </button>
          </div>
        </div>
        {showDashboard && dimension === "3d" ? (
          <span className="library-panel-sub">
            Cluster focus — click empty space to return to full map · double-click to move codes between clusters
          </span>
        ) : overviewMode ? (
          <span className="library-panel-sub">
            {sortedClusterIds.length} clusters · click a cluster to expand codes · scroll or use controls to zoom
          </span>
        ) : expandedClusterIds.size > 0 && usesExpandCollapse ? (
          <div className="codebook-3d-canvas-head-row">
            <button type="button" className="library-mini-btn codebook-3d-back-btn" onClick={() => handleToggleCluster("")}>
              ← Overview
            </button>
            <span className="library-panel-sub">
              {expandedClusterIds.size} cluster{expandedClusterIds.size === 1 ? "" : "s"} expanded · click another
              cluster to add more · drag codes between clusters · click again to collapse
            </span>
          </div>
        ) : (
          <span className="library-panel-sub">
            {dimension === "3d"
              ? "Scroll to zoom · drag to orbit · click a code to focus its cluster · double-click a code to move it"
              : "Drag to pan · scroll to zoom · click a cluster to expand · hover dots for code text"}
          </span>
        )}
      </div>

      {dimension === "3d" ? (
        <div
          className={showFocusChrome ? "codebook-3d-focus-split" : undefined}
          data-focus-open={showDashboard ? "true" : undefined}
        >
          <div className="codebook-3d-focus-visual">
            {screenLabelEntry && screenLabelClusterId && (
              <FocusClusterScreenLabel
                clusterId={screenLabelClusterId}
                entry={screenLabelEntry}
                codeCount={screenLabelCodes.length}
                color={screenLabelColor}
                visible={showFocusChrome}
              />
            )}
            <CodebookCluster3D
              {...sharedProps}
              focusClusterId={clusterFocusId}
              onExitFocus={exitClusterFocus}
              onFocusTransitionPhase={handleFocusTransitionPhase}
              onFocusCluster={handleFocusCluster}
              focusRemovingCode={focusRemovingCode}
              hideChrome
            />
          </div>
          {showDashboard && focusEntry && clusterFocusId && (
            <ClusterFocusDashboard
              clusterId={clusterFocusId}
              entry={focusEntry}
              codes={focusCodes}
              color={focusColor}
              highlighted={highlighted}
              sortedClusterIds={sortedClusterIds}
              clusters={clusters}
              clusterColor={clusterColor}
              onSelectCode={handleFocusCluster}
              onRequestMoveCode={onMoveCode ? handleRequestMoveCode : undefined}
              removingCode={focusRemovingCode}
              onBack={exitClusterFocus}
            />
          )}
        </div>
      ) : (
        <CodebookCluster2D {...sharedProps} hideChrome />
      )}

      {highlighted && (
        <div className="codebook-3d-selection-bar">
          <span
            className="codebook-3d-selection-pill"
            style={{
              ["--cluster-color" as string]: clusterColor.get(highlighted.clusterId) ?? "#7cf0d0",
            }}
          >
            {highlighted.code}
          </span>
          <span className="library-panel-sub">
            Selected — drag onto another cluster in the map or on the board below to move
          </span>
        </div>
      )}
    </div>
  );
}
