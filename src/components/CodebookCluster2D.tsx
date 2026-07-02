import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLargeCodebookDataset } from "../lib/codebookClusterLayout3d";
import { codebook3dCursors, type Codebook3DCursorMode } from "../lib/codebook3dCursors";
import {
  buildCodebook2DLayout,
  isDenseCodebookLayout,
  nearestDropClusterId,
  type Codebook2DCluster,
  type Codebook2DCodeNode,
} from "../lib/codebookClusterLayout2d";
import type { ClusterEntry } from "../lib/codebookReview";
import type { CodeEvidenceEntry } from "../lib/codeEvidence";
import type { HighlightedCode } from "./codebookClusterTypes";
import { CodeEvidenceHoverPanel } from "./CodeEvidenceHoverPanel";

const ZOOM_FACTOR = 1.22;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const VIEW_LERP = 0.2;
const VIEW_SNAP_EPS = 0.15;
const VIEW_SCALE_SNAP_EPS = 0.003;
const CLICK_DRAG_THRESHOLD_PX = 6;
const WHEEL_ZOOM_SENSITIVITY = 0.0016;

interface CodebookCluster2DProps {
  sortedClusterIds: string[];
  clusterToCodes: Record<string, string[]>;
  clusterColor: Map<string, string>;
  clusters: Record<string, ClusterEntry>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onExpandedClustersChange?: (clusterIds: string[]) => void;
  expandedClusterIds?: Set<string>;
  isSmallCodebook?: boolean;
  totalClusterCount?: number;
  isDark: boolean;
  hideChrome?: boolean;
  byOpenCode?: Record<string, CodeEvidenceEntry>;
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface DragState {
  kind: "pan" | "code";
  clusterId?: string;
  code?: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved?: boolean;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Keep the world point under a screen anchor fixed while scaling. */
function zoomViewAtAnchor(
  view: ViewTransform,
  anchorHostX: number,
  anchorHostY: number,
  hostW: number,
  hostH: number,
  factor: number
): ViewTransform {
  const cx = hostW / 2;
  const cy = hostH / 2;
  const worldX = (anchorHostX - cx - view.x) / view.scale;
  const worldY = (anchorHostY - cy - view.y) / view.scale;
  const scale = clampScale(view.scale * factor);
  return {
    scale,
    x: anchorHostX - cx - worldX * scale,
    y: anchorHostY - cy - worldY * scale,
  };
}

function clientToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: ViewTransform
): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    x: (clientX - cx - view.x) / view.scale,
    y: (clientY - cy - view.y) / view.scale,
  };
}

function fitView(bounds: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number): ViewTransform {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const pad = 28;
  const raw = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, MAX_SCALE);
  const scale = Math.min(raw * 1.25, MAX_SCALE);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: -cx * scale, y: -cy * scale, scale };
}

function svgSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ClusterLabels({
  clusters,
  view,
  hostSize,
  hoveredClusterId,
  highlighted,
}: {
  clusters: Codebook2DCluster[];
  view: ViewTransform;
  hostSize: { w: number; h: number };
  hoveredClusterId: string | null;
  highlighted: HighlightedCode | null;
}) {
  const cx = hostSize.w / 2 + view.x;
  const cy = hostSize.h / 2 + view.y;

  return (
    <>
      {clusters.map((cluster) => {
        const active =
          hoveredClusterId === cluster.clusterId ||
          cluster.dropTarget ||
          highlighted?.clusterId === cluster.clusterId;
        return (
          <div
            key={`lbl-${cluster.clusterId}`}
            className={`codebook-2d-map-label ${cluster.dimmed ? "codebook-2d-map-label--dimmed" : ""} ${active ? "codebook-2d-map-label--active" : ""} ${cluster.overviewOnly ? "codebook-2d-map-label--overview" : ""}`}
            style={{
              left: cx + cluster.x * view.scale,
              top: cy + cluster.labelAnchorY * view.scale,
              ["--cluster-color" as string]: cluster.color,
            }}
          >
            <span className="codebook-2d-map-label-title">{cluster.fullLabel}</span>
            <span className="codebook-2d-map-label-count">{cluster.codeCount}</span>
          </div>
        );
      })}
    </>
  );
}

function CodeDot({
  node,
  color,
  hovered,
}: {
  node: Codebook2DCodeNode;
  color: string;
  hovered: boolean;
}) {
  const active = node.highlighted || hovered;
  const r = active ? node.nodeR * 1.35 : node.nodeR;
  return (
    <g
      className={`codebook-2d-node ${node.highlighted ? "codebook-2d-node--active" : ""} ${node.dimmed ? "codebook-2d-node--dimmed" : ""}`}
      data-code-id={node.id}
      data-cluster-id={node.clusterId}
      data-code={node.code}
      opacity={node.opacity}
    >
      <title>{node.code}</title>
      {active && (
        <circle cx={node.x} cy={node.y} r={r + 5} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.55} />
      )}
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        className="codebook-2d-node-core"
        fill={color}
        fillOpacity={active ? 0.95 : 0.72}
        stroke={active ? "#fff" : "rgba(255,255,255,0.35)"}
        strokeWidth={active ? 2 : 1}
      />
    </g>
  );
}

export function CodebookCluster2D({
  sortedClusterIds,
  clusterToCodes,
  clusterColor,
  clusters,
  highlighted,
  onSelectCode,
  onClearSelection,
  onMoveCode,
  onExpandedClustersChange,
  expandedClusterIds: expandedClusterIdsProp,
  isSmallCodebook = false,
  totalClusterCount,
  isDark,
  hideChrome = false,
  byOpenCode = {},
}: CodebookCluster2DProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const expandedClusterIds = expandedClusterIdsProp ?? internalExpanded;
  const [dropTargetClusterId, setDropTargetClusterId] = useState<string | null>(null);
  const [draggingCodeKey, setDraggingCodeKey] = useState<string | null>(null);
  const [dragWorldPos, setDragWorldPos] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [hostSize, setHostSize] = useState({ w: 800, h: 400 });
  const [hoveredCodeId, setHoveredCodeId] = useState<string | null>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [cursorMode, setCursorMode] = useState<Codebook3DCursorMode>("orbit");
  const [dragOriginWorldPos, setDragOriginWorldPos] = useState<{ x: number; y: number } | null>(
    null
  );

  const cursors = useMemo(() => codebook3dCursors(isDark), [isDark]);
  const activeCursor = cursors[cursorMode];

  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef(view);
  const viewTargetRef = useRef(view);
  const viewAnimRef = useRef<number | null>(null);
  const layoutRef = useRef<ReturnType<typeof buildCodebook2DLayout> | null>(null);
  const layoutFpRef = useRef("");
  const dragGrabOffsetRef = useRef({ x: 0, y: 0 });
  const panClickSuppressedRef = useRef(false);
  viewRef.current = view;
  viewTargetRef.current = view;

  const stopViewAnimation = useCallback(() => {
    if (viewAnimRef.current != null) {
      cancelAnimationFrame(viewAnimRef.current);
      viewAnimRef.current = null;
    }
  }, []);

  const startViewAnimation = useCallback(() => {
    if (viewAnimRef.current != null) return;
    const tick = () => {
      const cur = viewRef.current;
      const tgt = viewTargetRef.current;
      const next: ViewTransform = {
        x: cur.x + (tgt.x - cur.x) * VIEW_LERP,
        y: cur.y + (tgt.y - cur.y) * VIEW_LERP,
        scale: cur.scale + (tgt.scale - cur.scale) * VIEW_LERP,
      };
      const done =
        Math.hypot(next.x - tgt.x, next.y - tgt.y) < VIEW_SNAP_EPS &&
        Math.abs(next.scale - tgt.scale) < VIEW_SCALE_SNAP_EPS;
      if (done) {
        viewRef.current = tgt;
        setView(tgt);
        viewAnimRef.current = null;
        return;
      }
      viewRef.current = next;
      setView(next);
      viewAnimRef.current = requestAnimationFrame(tick);
    };
    viewAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const setViewImmediate = useCallback(
    (next: ViewTransform) => {
      stopViewAnimation();
      viewRef.current = next;
      viewTargetRef.current = next;
      setView(next);
    },
    [stopViewAnimation]
  );

  const setViewAnimated = useCallback(
    (next: ViewTransform) => {
      viewTargetRef.current = next;
      startViewAnimation();
    },
    [startViewAnimation]
  );

  useEffect(() => () => stopViewAnimation(), [stopViewAnimation]);

  const setExpandedClusterIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === "function" ? updater(expandedClusterIds) : updater;
      if (!expandedClusterIdsProp) setInternalExpanded(next);
      onExpandedClustersChange?.([...next]);
    },
    [expandedClusterIds, expandedClusterIdsProp, onExpandedClustersChange]
  );

  const denseLayout = useMemo(
    () => !isSmallCodebook && isDenseCodebookLayout(sortedClusterIds, clusterToCodes),
    [isSmallCodebook, sortedClusterIds, clusterToCodes]
  );
  const isLargeDataset =
    !isSmallCodebook &&
    (isLargeCodebookDataset(totalClusterCount ?? sortedClusterIds.length) || denseLayout);
  const forceShowAllCodes = isSmallCodebook;
  const overviewMode = isLargeDataset && expandedClusterIds.size === 0;

  const layout = useMemo(
    () =>
      buildCodebook2DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters, {
        overviewMode,
        expandedClusterIds,
        forceShowAllCodes,
        highlighted,
        dropTargetClusterId,
        draggingCodeKey,
      }),
    [
      sortedClusterIds,
      clusterToCodes,
      clusterColor,
      clusters,
      overviewMode,
      expandedClusterIds,
      forceShowAllCodes,
      highlighted,
      dropTargetClusterId,
      draggingCodeKey,
    ]
  );
  layoutRef.current = layout;

  const allCodes = useMemo(() => layout.clusters.flatMap((c) => c.codes), [layout.clusters]);

  const handleToggleCluster = useCallback(
    (clusterId: string) => {
      if (!clusterId) {
        setExpandedClusterIds(new Set());
        onClearSelection();
        return;
      }
      setExpandedClusterIds((prev) => {
        const next = new Set(prev);
        if (next.has(clusterId)) next.delete(clusterId);
        else next.add(clusterId);
        return next;
      });
    },
    [onClearSelection, setExpandedClusterIds]
  );

  useEffect(() => {
    if (isSmallCodebook || !isLargeDataset || !highlighted) return;
    setExpandedClusterIds((prev) => {
      if (prev.has(highlighted.clusterId)) return prev;
      return new Set(prev).add(highlighted.clusterId);
    });
  }, [isSmallCodebook, isLargeDataset, highlighted, setExpandedClusterIds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (width > 0 && height > 0) setHostSize({ w: width, h: height });
    });
    ro.observe(host);
    const { width, height } = host.getBoundingClientRect();
    if (width > 0 && height > 0) setHostSize({ w: width, h: height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!expandedClusterIdsProp) setInternalExpanded(new Set());
    setDropTargetClusterId(null);
    setDraggingCodeKey(null);
    setDragWorldPos(null);
  }, [sortedClusterIds.join("|"), isSmallCodebook, expandedClusterIdsProp]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fp = `${overviewMode}|${[...expandedClusterIds].sort().join(",")}|${layout.clusters.map((c) => `${c.clusterId}:${c.overviewOnly}`).join(",")}`;
    if (fp === layoutFpRef.current) return;
    layoutFpRef.current = fp;
    const { width, height } = host.getBoundingClientRect();
    if (width > 0 && height > 0) setViewAnimated(fitView(layout.bounds, width, height));
  }, [layout, overviewMode, expandedClusterIds, setViewAnimated]);

  const applyFit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !layoutRef.current) return;
    const { width, height } = host.getBoundingClientRect();
    setViewAnimated(fitView(layoutRef.current.bounds, width, height));
  }, [setViewAnimated]);

  const zoomAtHostPoint = useCallback(
    (hostX: number, hostY: number, factor: number) => {
      const host = hostRef.current;
      if (!host) return;
      const { width, height } = host.getBoundingClientRect();
      const next = zoomViewAtAnchor(viewTargetRef.current, hostX, hostY, width, height, factor);
      setViewAnimated(next);
    },
    [setViewAnimated]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const host = hostRef.current;
      if (!host) return;
      const { width, height } = host.getBoundingClientRect();
      zoomAtHostPoint(width / 2, height / 2, factor);
    },
    [zoomAtHostPoint]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const next = zoomViewAtAnchor(
        viewTargetRef.current,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        factor
      );
      setViewAnimated(next);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [setViewAnimated]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const target = e.target as Element;
      const codeEl = target.closest("[data-code-id]") as HTMLElement | null;
      const rect = host.getBoundingClientRect();

      if (codeEl) {
        const codeId = codeEl.dataset.codeId!;
        const clusterId = codeEl.dataset.clusterId!;
        const code = codeEl.dataset.code!;
        const world = clientToWorld(e.clientX, e.clientY, rect, viewRef.current);
        const node = allCodes.find((c) => c.id === codeId);
        if (!node) return;
        onSelectCode(code, clusterId);
        if (!onMoveCode) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragGrabOffsetRef.current = { x: world.x - node.x, y: world.y - node.y };
        dragRef.current = {
          kind: "code",
          clusterId,
          code,
          startX: e.clientX,
          startY: e.clientY,
          originX: viewRef.current.x,
          originY: viewRef.current.y,
        };
        setDraggingCodeKey(`${clusterId}:${code}`);
        setDragOriginWorldPos({ x: node.x, y: node.y });
        setDragWorldPos({ x: node.x, y: node.y });
        setCursorMode("grabbing");
        return;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      panClickSuppressedRef.current = false;
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
        moved: false,
      };
      setCursorMode("grabbing");
    },
    [allCodes, onMoveCode, onSelectCode]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    const host = hostRef.current;
    if (!drag || !host) return;

    if (drag.kind === "pan") {
      if (
        !drag.moved &&
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > CLICK_DRAG_THRESHOLD_PX
      ) {
        drag.moved = true;
        panClickSuppressedRef.current = true;
      }
      const next = {
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
        scale: viewRef.current.scale,
      };
      setViewImmediate(next);
      return;
    }

    if (drag.kind === "code") {
      const rect = host.getBoundingClientRect();
      const world = clientToWorld(e.clientX, e.clientY, rect, viewRef.current);
      const grab = dragGrabOffsetRef.current;
      const pos = { x: world.x - grab.x, y: world.y - grab.y };
      setDragWorldPos(pos);
      setDropTargetClusterId(
        nearestDropClusterId(
          pos,
          layoutRef.current?.hubs ?? [],
          drag.clusterId!,
          layoutRef.current?.dropThreshold ?? 60,
          layoutRef.current?.clusters
        )
      );
    }
  }, [setViewImmediate]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      if (drag.kind === "code" && drag.code && drag.clusterId) {
        const host = hostRef.current;
        if (host) {
          const rect = host.getBoundingClientRect();
          const world = clientToWorld(e.clientX, e.clientY, rect, viewRef.current);
          const grab = dragGrabOffsetRef.current;
          const pos = { x: world.x - grab.x, y: world.y - grab.y };
          const target = nearestDropClusterId(
            pos,
            layoutRef.current?.hubs ?? [],
            drag.clusterId,
            layoutRef.current?.dropThreshold ?? 60,
            layoutRef.current?.clusters
          );
          if (target && onMoveCode) onMoveCode(drag.code, drag.clusterId, target);
        }
        setDropTargetClusterId(null);
        setDraggingCodeKey(null);
        setDragWorldPos(null);
        setDragOriginWorldPos(null);
        setCursorMode(hoveredCodeId ? "node" : "orbit");
      } else {
        setCursorMode(hoveredCodeId ? "node" : "orbit");
      }
    },
    [hoveredCodeId, onMoveCode]
  );

  const handleMapBackgroundClick = useCallback(() => {
    if (panClickSuppressedRef.current) {
      panClickSuppressedRef.current = false;
      return;
    }
    if (highlighted) onClearSelection();
    if (expandedClusterIds.size > 0) handleToggleCluster("");
  }, [highlighted, expandedClusterIds.size, handleToggleCluster, onClearSelection]);

  const handleTerritoryClick = useCallback(
    (cluster: Codebook2DCluster, e: React.MouseEvent) => {
      if ((e.target as Element).closest("[data-code-id]")) return;
      if (highlighted && highlighted.clusterId !== cluster.clusterId) {
        onClearSelection();
      }
      if (cluster.overviewOnly && (isLargeDataset || overviewMode)) {
        handleToggleCluster(cluster.clusterId);
      }
    },
    [highlighted, isLargeDataset, overviewMode, handleToggleCluster, onClearSelection]
  );

  const draggingNode = useMemo(() => {
    if (!draggingCodeKey || !dragWorldPos) return null;
    const sep = draggingCodeKey.indexOf(":");
    const clusterId = draggingCodeKey.slice(0, sep);
    const cluster = layout.clusters.find((c) => c.clusterId === clusterId);
    const code = cluster?.codes.find((c) => c.code === draggingCodeKey.slice(sep + 1));
    return { color: cluster?.color ?? "#7cf0d0", nodeR: code?.nodeR ?? 6, clusterId };
  }, [draggingCodeKey, dragWorldPos, layout.clusters]);

  const dragClusterLine = useMemo(() => {
    if (!draggingNode || !dropTargetClusterId || dropTargetClusterId === draggingNode.clusterId) {
      return null;
    }
    const fromHub = layout.hubs.find((h) => h.clusterId === draggingNode.clusterId);
    const toHub = layout.hubs.find((h) => h.clusterId === dropTargetClusterId);
    if (!fromHub || !toHub) return null;
    return { fromHub, toHub, color: draggingNode.color };
  }, [draggingNode, dropTargetClusterId, layout.hubs]);

  const hoveredCodePanel = useMemo(() => {
    if (!hoveredCodeId || draggingCodeKey) return null;
    const node = allCodes.find((c) => c.id === hoveredCodeId);
    if (!node) return null;
    const cluster = layout.clusters.find((c) => c.clusterId === node.clusterId);
    return { node, color: cluster?.color ?? "#7cf0d0" };
  }, [hoveredCodeId, draggingCodeKey, allCodes, layout.clusters]);

  const hoveredCodePanelPos = useMemo(() => {
    if (!hoveredCodePanel) return null;
    const { node } = hoveredCodePanel;
    const cx = hostSize.w / 2 + view.x;
    const cy = hostSize.h / 2 + view.y;
    return { left: cx + node.x * view.scale, top: cy + node.y * view.scale };
  }, [hoveredCodePanel, hostSize.w, hostSize.h, view.x, view.y, view.scale]);

  if (layout.clusters.length === 0) {
    return (
      <div className="codebook-graph-empty glass-panel">
        <p className="library-empty-body">No codes to visualize yet.</p>
      </div>
    );
  }

  const map = (
    <div
      ref={hostRef}
      className={`codebook-graph-map-host codebook-2d-map ${isDark ? "codebook-2d-map--dark" : "codebook-2d-map--light"}`}
      style={{ cursor: activeCursor }}
    >
      {hoveredCodePanel && hoveredCodePanelPos && (
        <CodeEvidenceHoverPanel
          codeLabel={hoveredCodePanel.node.code}
          byOpenCode={byOpenCode}
          clusterColor={hoveredCodePanel.color}
          className="codebook-node-hover-panel codebook-node-hover-panel--2d"
          style={{
            left: hoveredCodePanelPos.left,
            top: hoveredCodePanelPos.top,
          }}
        />
      )}

      <ClusterLabels
        clusters={layout.clusters}
        view={view}
        hostSize={hostSize}
        hoveredClusterId={hoveredClusterId}
        highlighted={highlighted}
      />

      <svg
        className="codebook-2d-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleMapBackgroundClick();
        }}
      >
        <defs>
          <pattern id="codebook-2d-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="rgba(148,163,184,0.1)" />
          </pattern>
          {layout.clusters.map((cluster) => {
            const sid = svgSafeId(cluster.clusterId);
            return (
              <radialGradient key={sid} id={`territory-${sid}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={cluster.color} stopOpacity={0.22} />
                <stop offset="72%" stopColor={cluster.color} stopOpacity={0.08} />
                <stop offset="100%" stopColor={cluster.color} stopOpacity={0.02} />
              </radialGradient>
            );
          })}
        </defs>

        <g className="codebook-2d-world" transform={`translate(${hostSize.w / 2 + view.x}, ${hostSize.h / 2 + view.y}) scale(${view.scale})`}>
          <rect
            x={layout.bounds.minX - 60}
            y={layout.bounds.minY - 60}
            width={layout.bounds.maxX - layout.bounds.minX + 120}
            height={layout.bounds.maxY - layout.bounds.minY + 120}
            fill="url(#codebook-2d-dots)"
            className="codebook-2d-bg"
            onClick={handleMapBackgroundClick}
          />

          {layout.clusters.map((cluster) => {
            const sid = svgSafeId(cluster.clusterId);
            const active =
              hoveredClusterId === cluster.clusterId ||
              cluster.dropTarget ||
              highlighted?.clusterId === cluster.clusterId;
            return (
              <g
                key={cluster.clusterId}
                className={`codebook-2d-territory ${cluster.overviewOnly ? "codebook-2d-territory--overview" : ""} ${cluster.dimmed ? "codebook-2d-territory--dimmed" : ""} ${cluster.dropTarget ? "codebook-2d-territory--drop" : ""} ${active ? "codebook-2d-territory--active" : ""}`}
                onMouseEnter={() => setHoveredClusterId(cluster.clusterId)}
                onMouseLeave={() => setHoveredClusterId(null)}
                onClick={(e) => handleTerritoryClick(cluster, e)}
              >
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={cluster.radius}
                  fill={`url(#territory-${sid})`}
                  className="codebook-2d-territory-fill"
                />
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={cluster.radius}
                  fill="none"
                  stroke={cluster.dropTarget ? "#fff" : cluster.color}
                  strokeWidth={cluster.dropTarget ? 2.5 : active ? 2 : 1.2}
                  strokeOpacity={cluster.dropTarget ? 0.95 : active ? 0.85 : 0.45}
                  className="codebook-2d-territory-ring"
                />
                {cluster.overviewOnly && (
                  <g className="codebook-2d-territory-overview" pointerEvents="none">
                    <text
                      x={cluster.x}
                      y={cluster.y + 6}
                      textAnchor="middle"
                      className="codebook-2d-territory-count"
                      fill="#f8fafc"
                    >
                      {cluster.codeCount}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          <g className="codebook-2d-edges" pointerEvents="none">
            {layout.edges.map(([a, b], i) => {
              const na = allCodes[a];
              const nb = allCodes[b];
              if (!na || !nb || na.clusterId !== nb.clusterId) return null;
              const cluster = layout.clusters.find((c) => c.clusterId === na.clusterId);
              return (
                <line
                  key={`e-${i}`}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke={cluster?.color ?? "#7cf0d0"}
                  strokeOpacity={0.18}
                  strokeWidth={1}
                />
              );
            })}
          </g>

          {layout.clusters.map((cluster) =>
            cluster.codes.map((node) => (
              <g
                key={node.id}
                onMouseEnter={() => {
                  setHoveredCodeId(node.id);
                  if (!draggingCodeKey) setCursorMode("node");
                }}
                onMouseLeave={() => {
                  setHoveredCodeId(null);
                  if (!draggingCodeKey) setCursorMode("orbit");
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCode(node.code, node.clusterId);
                }}
              >
                <CodeDot node={node} color={cluster.color} hovered={hoveredCodeId === node.id} />
              </g>
            ))
          )}

          {dragClusterLine && (
            <g className="codebook-2d-drag-cluster-line" pointerEvents="none">
              <line
                x1={dragClusterLine.fromHub.x}
                y1={dragClusterLine.fromHub.y}
                x2={dragClusterLine.toHub.x}
                y2={dragClusterLine.toHub.y}
                stroke={dragClusterLine.color}
                strokeWidth={3}
                strokeOpacity={0.45}
                strokeLinecap="round"
              />
              <line
                x1={dragClusterLine.fromHub.x}
                y1={dragClusterLine.fromHub.y}
                x2={dragClusterLine.toHub.x}
                y2={dragClusterLine.toHub.y}
                stroke={dragClusterLine.color}
                strokeWidth={1.25}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeDasharray="7 5"
              />
            </g>
          )}

          {draggingNode && dragWorldPos && dragOriginWorldPos && (
            <g className="codebook-2d-drag-trail" pointerEvents="none">
              <line
                x1={dragOriginWorldPos.x}
                y1={dragOriginWorldPos.y}
                x2={dragWorldPos.x}
                y2={dragWorldPos.y}
                stroke={draggingNode.color}
                strokeWidth={3}
                strokeOpacity={0.35}
                strokeLinecap="round"
              />
              <line
                x1={dragOriginWorldPos.x}
                y1={dragOriginWorldPos.y}
                x2={dragWorldPos.x}
                y2={dragWorldPos.y}
                stroke={draggingNode.color}
                strokeWidth={1.5}
                strokeOpacity={0.75}
                strokeLinecap="round"
              />
            </g>
          )}

          {draggingNode && dragWorldPos && (
            <g className="codebook-2d-node codebook-2d-node--dragging" style={{ pointerEvents: "none" }}>
              <circle
                cx={dragWorldPos.x}
                cy={dragWorldPos.y}
                r={draggingNode.nodeR + 4}
                fill="none"
                stroke={draggingNode.color}
                strokeWidth={2}
                strokeOpacity={0.6}
              />
              <circle
                cx={dragWorldPos.x}
                cy={dragWorldPos.y}
                r={draggingNode.nodeR}
                fill={draggingNode.color}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}
        </g>
      </svg>

      <div className="codebook-2d-hint">
        <span>Drag to pan</span>
        <span>Scroll to zoom</span>
        {isLargeDataset && <span>Click a cluster to reveal its codes</span>}
        <span>Hover a dot for grounded quotes</span>
      </div>

      <div className="graph-controls">
        <button type="button" className="graph-ctrl" onClick={() => zoomBy(ZOOM_FACTOR)} title="Zoom in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="graph-ctrl" onClick={() => zoomBy(1 / ZOOM_FACTOR)} title="Zoom out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="graph-ctrl-divider" />
        <button type="button" className="graph-ctrl" onClick={applyFit} title="Fit to view">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  if (hideChrome) return map;

  return (
    <div className="codebook-3d-canvas-wrap glass-panel">
      <div className="codebook-3d-canvas-head">
        <h4>2D cluster map</h4>
      </div>
      {map}
      {highlighted && (
        <div className="codebook-3d-selection-bar">
          <span
            className="codebook-3d-selection-pill"
            style={{ ["--cluster-color" as string]: clusterColor.get(highlighted.clusterId) ?? "#7cf0d0" }}
          >
            {highlighted.code}
          </span>
          <span className="library-panel-sub">
            Selected — drag onto another cluster or use the board below to move
          </span>
        </div>
      )}
    </div>
  );
}
