import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLargeCodebookDataset } from "../lib/codebookClusterLayout3d";
import {
  buildCodebook2DLayout,
  nearestDropClusterId,
  type Codebook2DCodeNode,
  type Codebook2DIsland,
} from "../lib/codebookClusterLayout2d";
import type { ClusterEntry } from "../lib/codebookReview";
import type { HighlightedCode } from "./codebookClusterTypes";

const ZOOM_FACTOR = 1.35;
const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

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
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface DragState {
  kind: "pan" | "code";
  codeId?: string;
  clusterId?: string;
  code?: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  nodeStartX?: number;
  nodeStartY?: number;
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
  const pad = 20;
  const raw = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, MAX_SCALE);
  const scale = Math.min(raw * 1.35, MAX_SCALE);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: -cx * scale, y: -cy * scale, scale };
}

function shortCodeLabel(code: string): string {
  const t = code.trim();
  if (t.length <= 4) return t;
  return "…";
}

const PILL_HW = 17;
const PILL_HH = 13;

function svgSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function IslandLabel({ island, active }: { island: Codebook2DIsland; active: boolean }) {
  const { labelBoxX, labelBoxY, labelBoxW, labelBoxH, color } = island;
  return (
    <g className={`codebook-island-label ${island.dimmed ? "codebook-island-label--dimmed" : ""} ${active ? "codebook-island-label--active" : ""}`}>
      <title>{island.fullLabel}</title>
      <line
        x1={island.labelLineX}
        y1={island.labelLineY}
        x2={island.labelConnectX}
        y2={island.labelConnectY}
        className="codebook-island-label-connector"
        stroke={color}
      />
      <rect
        x={labelBoxX}
        y={labelBoxY}
        width={labelBoxW}
        height={labelBoxH}
        rx={14}
        className="codebook-island-label-bg"
        fill="rgba(8,11,18,0.88)"
        stroke={color}
        strokeOpacity={active ? 0.75 : 0.45}
      />
      <rect
        x={labelBoxX}
        y={labelBoxY + 10}
        width={4}
        height={labelBoxH - 20}
        rx={2}
        fill={color}
        className="codebook-island-label-accent"
      />
      <foreignObject x={labelBoxX + 14} y={labelBoxY + 10} width={labelBoxW - 22} height={labelBoxH - 18}>
        <div className="codebook-island-label-card">
          <div className="codebook-island-label-title" style={{ color }}>
            {island.fullLabel}
          </div>
          <div className="codebook-island-label-meta" style={{ color }}>
            {island.codeCount} code{island.codeCount === 1 ? "" : "s"}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function CodePill({
  code,
  island,
  hovered,
  pillFillId,
}: {
  code: Codebook2DCodeNode;
  island: Codebook2DIsland;
  hovered: boolean;
  pillFillId: string;
}) {
  const label = code.shortLabel;
  const scale = hovered || code.highlighted ? 1.14 : 1;
  return (
    <g
      transform={`translate(${code.x} ${code.y}) scale(${scale}) translate(${-code.x} ${-code.y})`}
      className={`codebook-island-code ${code.highlighted ? "codebook-island-code--active" : ""} ${code.dimmed ? "codebook-island-code--dimmed" : ""}`}
      data-code-id={code.id}
      data-cluster-id={code.clusterId}
      data-code={code.code}
      opacity={code.opacity}
    >
      <title>{code.title}</title>
      <rect
        x={code.x - PILL_HW}
        y={code.y - PILL_HH}
        width={PILL_HW * 2}
        height={PILL_HH * 2}
        rx={PILL_HH}
        className="codebook-island-code-shadow"
        fill="rgba(0,0,0,0.45)"
        transform={`translate(0 2)`}
      />
      <rect
        x={code.x - PILL_HW}
        y={code.y - PILL_HH}
        width={PILL_HW * 2}
        height={PILL_HH * 2}
        rx={PILL_HH}
        className="codebook-island-code-pill"
        fill={`url(#${pillFillId})`}
        stroke={island.color}
        strokeWidth={code.highlighted || hovered ? 2 : 1.4}
      />
      <rect
        x={code.x - PILL_HW + 2}
        y={code.y - PILL_HH + 2}
        width={PILL_HW * 2 - 4}
        height={5}
        rx={3}
        fill="rgba(255,255,255,0.18)"
        pointerEvents="none"
      />
      <text x={code.x} y={code.y + 4} textAnchor="middle" className="codebook-island-code-label" fill={island.color}>
        {label}
      </text>
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

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef(view);
  const layoutRef = useRef<ReturnType<typeof buildCodebook2DLayout> | null>(null);
  const layoutFpRef = useRef("");
  viewRef.current = view;

  const setExpandedClusterIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === "function" ? updater(expandedClusterIds) : updater;
      if (!expandedClusterIdsProp) setInternalExpanded(next);
      onExpandedClustersChange?.([...next]);
    },
    [expandedClusterIds, expandedClusterIdsProp, onExpandedClustersChange]
  );

  const isLargeDataset = !isSmallCodebook && isLargeCodebookDataset(totalClusterCount ?? sortedClusterIds.length);
  const overviewMode = isLargeDataset && expandedClusterIds.size === 0;

  const layout = useMemo(
    () =>
      buildCodebook2DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters, {
        overviewMode,
        expandedClusterIds,
        forceShowAllCodes: isSmallCodebook,
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
      isSmallCodebook,
      highlighted,
      dropTargetClusterId,
      draggingCodeKey,
    ]
  );
  layoutRef.current = layout;

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
    const fp = `${overviewMode}|${layout.islands.map((i) => i.clusterId).join(",")}`;
    if (fp === layoutFpRef.current) return;
    layoutFpRef.current = fp;
    const { width, height } = host.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setView(fitView(layout.bounds, width, height));
    }
  }, [layout, overviewMode]);

  const applyFit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !layoutRef.current) return;
    const { width, height } = host.getBoundingClientRect();
    setView(fitView(layoutRef.current.bounds, width, height));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor)) }));
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor)) }));
  }, []);

  const dragGrabOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
        const node = layoutRef.current?.islands.flatMap((i) => i.codes).find((c) => c.id === codeId);
        if (!node) return;
        onSelectCode(code, clusterId);
        if (!onMoveCode) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragGrabOffsetRef.current = { x: world.x - node.x, y: world.y - node.y };
        dragRef.current = {
          kind: "code",
          codeId,
          clusterId,
          code,
          startX: e.clientX,
          startY: e.clientY,
          originX: viewRef.current.x,
          originY: viewRef.current.y,
          nodeStartX: node.x,
          nodeStartY: node.y,
        };
        setDraggingCodeKey(`${clusterId}:${code}`);
        setDragWorldPos({ x: node.x, y: node.y });
        return;
      }

      if (target.closest(".codebook-island-code")) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      };
    },
    [onMoveCode, onSelectCode]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    const host = hostRef.current;
    if (!drag || !host) return;

    if (drag.kind === "pan") {
      setView((v) => ({
        ...v,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      }));
      return;
    }

    if (drag.kind === "code") {
      const rect = host.getBoundingClientRect();
      const world = clientToWorld(e.clientX, e.clientY, rect, viewRef.current);
      const grab = dragGrabOffsetRef.current;
      const pos = { x: world.x - grab.x, y: world.y - grab.y };
      setDragWorldPos(pos);

      const target = nearestDropClusterId(
        pos,
        layoutRef.current?.hubs ?? [],
        drag.clusterId!,
        layoutRef.current?.dropThreshold ?? 60
      );
      setDropTargetClusterId(target);
    }
  }, []);

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
            layoutRef.current?.dropThreshold ?? 60
          );
          if (target && onMoveCode) {
            onMoveCode(drag.code, drag.clusterId, target);
          }
        }
        setDropTargetClusterId(null);
        setDraggingCodeKey(null);
        setDragWorldPos(null);
        return;
      }
    },
    [onMoveCode]
  );

  const onIslandClick = useCallback(
    (clusterId: string, overviewOnly: boolean, target: Element) => {
      if (target.closest(".codebook-island-code")) return;
      if (overviewOnly && (overviewMode || isLargeDataset)) {
        handleToggleCluster(clusterId);
        return;
      }
      if (!overviewOnly && isLargeDataset) {
        handleToggleCluster(clusterId);
      }
    },
    [handleToggleCluster, isLargeDataset, overviewMode]
  );

  const onBackgroundClick = useCallback(() => {
    if (expandedClusterIds.size > 0) handleToggleCluster("");
  }, [expandedClusterIds.size, handleToggleCluster]);

  const draggingNode = useMemo(() => {
    if (!draggingCodeKey || !dragWorldPos) return null;
    const sep = draggingCodeKey.indexOf(":");
    const clusterId = draggingCodeKey.slice(0, sep);
    const codeName = draggingCodeKey.slice(sep + 1);
    const island = layout.islands.find((i) => i.clusterId === clusterId);
    const code = island?.codes.find((c) => c.code === codeName);
    return {
      shortLabel: code?.shortLabel ?? shortCodeLabel(codeName),
      color: island?.color ?? "#7cf0d0",
    };
  }, [draggingCodeKey, dragWorldPos, layout.islands]);

  const hoveredCodePanel = useMemo(() => {
    if (!hoveredCodeId || draggingCodeKey) return null;
    for (const island of layout.islands) {
      const node = island.codes.find((c) => c.id === hoveredCodeId);
      if (node) return { node, color: island.color };
    }
    return null;
  }, [hoveredCodeId, draggingCodeKey, layout.islands]);

  const hoveredCodePanelPos = useMemo(() => {
    if (!hoveredCodePanel) return null;
    const { node } = hoveredCodePanel;
    const cx = hostSize.w / 2 + view.x;
    const cy = hostSize.h / 2 + view.y;
    return {
      left: cx + node.x * view.scale,
      top: cy + node.y * view.scale,
    };
  }, [hoveredCodePanel, hostSize.w, hostSize.h, view.x, view.y, view.scale]);

  if (layout.islands.length === 0) {
    return (
      <div className="codebook-graph-empty glass-panel">
        <p className="library-empty-body">No codes to visualize yet.</p>
      </div>
    );
  }

  const map = (
    <div
      ref={hostRef}
      className={`codebook-graph-map-host codebook-island-map ${isDark ? "codebook-island-map--dark" : "codebook-island-map--light"}`}
      onWheel={onWheel}
    >
      {hoveredCodePanel && hoveredCodePanelPos && (
        <div
          className="codebook-node-hover-panel codebook-node-hover-panel--2d"
          style={{
            left: hoveredCodePanelPos.left,
            top: hoveredCodePanelPos.top,
            ["--cluster-color" as string]: hoveredCodePanel.color,
          }}
        >
          {hoveredCodePanel.node.code}
        </div>
      )}
      <svg
        ref={svgRef}
        className="codebook-island-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) onBackgroundClick();
        }}
      >
        <defs>
          <pattern id="island-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="rgba(148,163,184,0.14)" />
          </pattern>

          {layout.islands.map((island) => {
            const sid = svgSafeId(island.clusterId);
            return (
              <g key={`defs-${island.clusterId}`}>
                <radialGradient id={`island-fill-${sid}`} cx="50%" cy="42%" r="68%">
                  <stop offset="0%" stopColor={island.color} stopOpacity={0.34} />
                  <stop offset="55%" stopColor={island.color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={island.color} stopOpacity={0.03} />
                </radialGradient>
                <linearGradient id={`pill-fill-${sid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(18,22,32,0.95)" />
                  <stop offset="100%" stopColor="rgba(8,10,16,0.98)" />
                </linearGradient>
                <clipPath id={`island-clip-${sid}`}>
                  <path d={island.boundaryPath} />
                </clipPath>
                <filter id={`island-glow-${sid}`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id={`island-aura-${sid}`} x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur stdDeviation="14" />
                </filter>
              </g>
            );
          })}
        </defs>

        <g transform={`translate(${hostSize.w / 2 + view.x}, ${hostSize.h / 2 + view.y}) scale(${view.scale})`}>
          <rect
            x={layout.bounds.minX - 120}
            y={layout.bounds.minY - 120}
            width={layout.bounds.maxX - layout.bounds.minX + 240}
            height={layout.bounds.maxY - layout.bounds.minY + 240}
            fill="url(#island-dot-grid)"
            className="codebook-island-bg-grid"
          />

          <g className="codebook-island-bridges">
            {layout.bridgePaths.map((bridge) => (
              <path key={bridge.id} d={bridge.d} className="codebook-island-bridge" stroke={bridge.color} fill="none" />
            ))}
          </g>

          <g className="codebook-island-topo">
            {layout.islands.flatMap((island) =>
              island.contourPaths.map((path, i) => (
                <path
                  key={`${island.clusterId}-contour-${i}`}
                  d={path}
                  className="codebook-island-contour"
                  stroke={island.color}
                  fill="none"
                />
              ))
            )}
          </g>

          {layout.islands.map((island) => {
            const sid = svgSafeId(island.clusterId);
            const active = hoveredClusterId === island.clusterId || island.dropTarget || highlighted?.clusterId === island.clusterId;
            return (
            <g
              key={island.clusterId}
              className={`codebook-island ${island.overviewOnly ? "codebook-island--overview" : ""} ${island.dimmed ? "codebook-island--dimmed" : ""} ${island.dropTarget ? "codebook-island--drop-target" : ""} ${active ? "codebook-island--active" : ""}`}
              onMouseEnter={() => setHoveredClusterId(island.clusterId)}
              onMouseLeave={() => setHoveredClusterId(null)}
              onClick={(e) => onIslandClick(island.clusterId, island.overviewOnly, e.target as Element)}
            >
              <path
                d={island.boundaryPath}
                className="codebook-island-aura"
                fill="none"
                stroke={island.color}
                strokeWidth={active ? 16 : 10}
                filter={`url(#island-aura-${sid})`}
              />
              <path
                d={island.boundaryPath}
                className="codebook-island-fill"
                fill={`url(#island-fill-${sid})`}
              />
              <path
                d={island.boundaryPath}
                className="codebook-island-stroke"
                fill="none"
                stroke={island.color}
                filter={`url(#island-glow-${sid})`}
              />

              {island.overviewOnly && (
                <g className="codebook-island-overview">
                  <circle cx={island.x} cy={island.y} r={14} fill={island.color} fillOpacity={0.35} />
                  <text x={island.x} y={island.y + 4} textAnchor="middle" className="codebook-island-overview-hint" fill="#f8fafc">
                    {island.codeCount}
                  </text>
                </g>
              )}

              <g clipPath={`url(#island-clip-${sid})`}>
                {island.codes.map((code) => (
                  <g
                    key={code.id}
                    onMouseEnter={() => setHoveredCodeId(code.id)}
                    onMouseLeave={() => setHoveredCodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCode(code.code, code.clusterId);
                    }}
                  >
                    <CodePill
                      code={code}
                      island={island}
                      hovered={hoveredCodeId === code.id}
                      pillFillId={`pill-fill-${sid}`}
                    />
                  </g>
                ))}
              </g>
            </g>
          );
          })}

          <g className="codebook-island-labels">
            {layout.islands.map((island) => {
              const active =
                hoveredClusterId === island.clusterId ||
                island.dropTarget ||
                highlighted?.clusterId === island.clusterId;
              return <IslandLabel key={`label-${island.clusterId}`} island={island} active={active} />;
            })}
          </g>

          {draggingNode && dragWorldPos && (
            <g className="codebook-island-code codebook-island-code--dragging" style={{ pointerEvents: "none" }}>
              <rect
                x={dragWorldPos.x - PILL_HW}
                y={dragWorldPos.y - PILL_HH + 2}
                width={PILL_HW * 2}
                height={PILL_HH * 2}
                rx={PILL_HH}
                className="codebook-island-code-shadow"
                fill="rgba(0,0,0,0.5)"
              />
              <rect
                x={dragWorldPos.x - PILL_HW}
                y={dragWorldPos.y - PILL_HH}
                width={PILL_HW * 2}
                height={PILL_HH * 2}
                rx={PILL_HH}
                className="codebook-island-code-pill"
                fill="rgba(12,14,22,0.95)"
                stroke={draggingNode.color}
                strokeWidth={2}
              />
              <text x={dragWorldPos.x} y={dragWorldPos.y + 4} textAnchor="middle" className="codebook-island-code-label" fill={draggingNode.color}>
                {draggingNode.shortLabel}
              </text>
            </g>
          )}
        </g>
      </svg>

      <div className="codebook-island-hint">
        <span>Drag to move</span>
        <span>Scroll to zoom</span>
        <span>Hover a pill for the full code</span>
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
