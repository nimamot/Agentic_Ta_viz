import { useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { VisNode, VisEdge } from "../types";
import { getOverviewPhysicsOptions, getFocusPhysicsOptions } from "../lib/graphBuilder";

const ZOOM_FACTOR = 1.4;

/** vis-network may return string ids; our graph uses numeric ids — mismatch breaks expand/collapse. */
function normalizeClickedNodeId(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildChildrenMapFromEdges(
  edges: { from: number | string; to: number | string }[]
): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const e of edges) {
    const from = typeof e.from === "number" ? e.from : Number(e.from);
    const to = typeof e.to === "number" ? e.to : Number(e.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const arr = m.get(from);
    if (arr) arr.push(to);
    else m.set(from, [to]);
  }
  for (const arr of m.values()) arr.sort((a, b) => a - b);
  return m;
}

/** All proper descendants in a directed tree (edges parent → child). */
function collectDescendantIds(
  rootId: number,
  childrenMap: Map<number, number[]>
): number[] {
  const out: number[] = [];
  const stack = [...(childrenMap.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const c of childrenMap.get(id) ?? []) stack.push(c);
  }
  return out;
}

/** Root plus all descendants (directed tree), for sector centroids. */
function collectSubtreeIds(rootId: number, childrenMap: Map<number, number[]>): number[] {
  const out: number[] = [rootId];
  const stack = [...(childrenMap.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const c of childrenMap.get(id) ?? []) stack.push(c);
  }
  return out;
}

type FlowerDragState = {
  rootId: number;
  rootStart: { x: number; y: number };
  descStart: Map<number, { x: number; y: number }>;
};

const interactionOptions = {
  hover: true,
  tooltipDelay: 100,
  zoomView: true,
  zoomSpeed: 1.2,
  dragView: true,
  dragNodes: true,
  selectConnectedEdges: false,
  multiselect: false,
  selectable: true,
} as const;

function topologyFingerprint(
  layoutEngine: string,
  mode: string,
  layoutTuningKey: string,
  nodes: VisNode[],
  edges: VisEdge[]
): string {
  const n = nodes
    .map((x) => x.id)
    .sort((a, b) => a - b)
    .join(",");
  const e = edges
    .map((x) => `${x.from}->${x.to}:${x.id}`)
    .sort()
    .join("|");
  return `${layoutEngine}|${mode}|${layoutTuningKey}|${n}#${e}`;
}

export type HierarchicalSpacingOptions = {
  levelSeparation?: number;
  nodeSpacing?: number;
  treeSpacing?: number;
};

/** Top-down tree layout (parent above children); physics off — vis positions by level. */
function getHierarchyLayoutOptions(overrides?: HierarchicalSpacingOptions) {
  return {
    physics: { enabled: false as const },
    layout: {
      hierarchical: {
        enabled: true,
        direction: "UD" as const,
        sortMethod: "directed" as const,
        shakeTowards: "roots" as const,
        levelSeparation: overrides?.levelSeparation ?? 150,
        nodeSpacing: overrides?.nodeSpacing ?? 72,
        treeSpacing: overrides?.treeSpacing ?? 320,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
      },
    },
  };
}

interface GraphViewProps {
  nodes: VisNode[];
  edges: VisEdge[];
  mode: "overview" | "focus" | "hierarchy";
  /** When set, overrides layout implied by `mode` (fixes multi-graph pages where vis kept hierarchical layout). */
  layoutEngine?: "hierarchical" | "force" | "flower";
  onNodeSelect: (nodeId: number) => void;
  onStabilized?: () => void;
  fitOnStabilized?: boolean;
  /** Window key for PNG export, e.g. `__graphExport_libraryGlobal` when multiple graphs mount. */
  exportWindowKey?: string;
  /** Wider spacing for readable one-level tree views (Library drill-down). */
  hierarchicalSpacing?: HierarchicalSpacingOptions;
  /** Meta-theme nodes (theme tree): show fixed labels at subtree centroids when `showMetaThemeSectorLabels` is true. */
  metaThemeSectorLabels?: { id: number; label: string }[];
  showMetaThemeSectorLabels?: boolean;
}

export function GraphView({
  nodes,
  edges,
  mode,
  layoutEngine,
  onNodeSelect,
  onStabilized,
  fitOnStabilized = true,
  exportWindowKey = "__graphExport",
  hierarchicalSpacing,
  metaThemeSectorLabels,
  showMetaThemeSectorLabels,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<VisNode> | null>(null);
  const edgesDsRef = useRef<DataSet<VisEdge> | null>(null);
  const metaSectorLabelElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const topologyRef = useRef<string | null>(null);
  const stabilizeGenRef = useRef(0);
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const flowerDragRef = useRef<FlowerDragState | null>(null);

  const physics = useMemo(
    () =>
      mode === "focus" ? getFocusPhysicsOptions() : getOverviewPhysicsOptions(),
    [mode]
  );

  const resolvedLayout =
    layoutEngine ?? (mode === "hierarchy" ? "hierarchical" : "force");
  const isHierarchy = resolvedLayout === "hierarchical";
  const isFlower = resolvedLayout === "flower";

  const resolvedLayoutRef = useRef(resolvedLayout);
  resolvedLayoutRef.current = resolvedLayout;

  const layoutTuningKey = hierarchicalSpacing
    ? `${hierarchicalSpacing.levelSeparation ?? ""}:${hierarchicalSpacing.nodeSpacing ?? ""}:${hierarchicalSpacing.treeSpacing ?? ""}`
    : "";

  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDs = new DataSet<VisNode>([]);
    const edgesDs = new DataSet<VisEdge>([]);
    nodesDsRef.current = nodesDs;
    edgesDsRef.current = edgesDs;

    const net = new Network(
      containerRef.current,
      { nodes: nodesDs, edges: edgesDs } as Parameters<Network["setData"]>[0],
      {
        autoResize: true,
        nodes: { shape: "dot" as const },
        edges: {
          selectionWidth: 0,
          hoverWidth: 0,
          arrows: { to: { enabled: true, scaleFactor: 0.45 } },
        },
        physics: { enabled: false },
        interaction: { ...interactionOptions },
      }
    );

    net.on("click", (params) => {
      const netInst = networkRef.current;
      let raw: unknown;
      // DOM coords + getNodeAt = topmost drawn node at pixel (selection order can differ when labels overlap).
      if (netInst && params.pointer?.DOM) {
        raw = netInst.getNodeAt(params.pointer.DOM);
      }
      if (raw === undefined || raw === null) {
        raw = params.nodes?.[0];
      }
      const id = normalizeClickedNodeId(raw);
      if (id != null) {
        if (resolvedLayoutRef.current === "flower") {
          netInst?.selectNodes([id]);
        }
        onNodeSelectRef.current(id);
      }
    });

    const onFlowerDragStart = (params: { nodes?: (string | number)[] }) => {
      if (resolvedLayoutRef.current !== "flower") return;
      const rootId = normalizeClickedNodeId(params.nodes?.[0]);
      if (rootId == null) return;
      const edgesDs = edgesDsRef.current;
      if (!edgesDs) return;
      const childrenMap = buildChildrenMapFromEdges(edgesDs.get());
      const descIds = collectDescendantIds(rootId, childrenMap);
      if (descIds.length === 0) return;

      const ids = [rootId, ...descIds];
      const positions = net.getPositions(ids);
      const r0 = positions[rootId];
      if (!r0 || typeof r0.x !== "number" || typeof r0.y !== "number") return;

      const descStart = new Map<number, { x: number; y: number }>();
      for (const id of descIds) {
        const p = positions[id];
        if (p && typeof p.x === "number" && typeof p.y === "number") {
          descStart.set(id, { x: p.x, y: p.y });
        }
      }
      flowerDragRef.current = {
        rootId,
        rootStart: { x: r0.x, y: r0.y },
        descStart,
      };
    };

    const onFlowerDragging = () => {
      const state = flowerDragRef.current;
      const nodesDs = nodesDsRef.current;
      if (!state || !nodesDs) return;
      const positions = net.getPositions([state.rootId]);
      const r = positions[state.rootId];
      if (!r || typeof r.x !== "number" || typeof r.y !== "number") return;

      const dx = r.x - state.rootStart.x;
      const dy = r.y - state.rootStart.y;
      if (dx === 0 && dy === 0 && state.descStart.size === 0) return;

      const updates: Array<Pick<VisNode, "id"> & { x: number; y: number }> = [];
      for (const [id, p0] of state.descStart) {
        updates.push({ id, x: p0.x + dx, y: p0.y + dy });
      }
      if (updates.length) nodesDs.update(updates as VisNode[]);
    };

    const onFlowerDragEnd = () => {
      flowerDragRef.current = null;
    };

    net.on("dragStart", onFlowerDragStart);
    net.on("dragging", onFlowerDragging);
    net.on("dragEnd", onFlowerDragEnd);

    networkRef.current = net;
    return () => {
      net.off("dragStart", onFlowerDragStart);
      net.off("dragging", onFlowerDragging);
      net.off("dragEnd", onFlowerDragEnd);
      flowerDragRef.current = null;
      net.destroy();
      networkRef.current = null;
      nodesDsRef.current = null;
      edgesDsRef.current = null;
      topologyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const net = networkRef.current;
    const nodesDs = nodesDsRef.current;
    const edgesDs = edgesDsRef.current;
    if (!net || !nodesDs || !edgesDs) return;

    const fp = topologyFingerprint(resolvedLayout, mode, layoutTuningKey, nodes, edges);
    const topologyChanged = fp !== topologyRef.current;
    topologyRef.current = fp;

    if (topologyChanged) {
      stabilizeGenRef.current += 1;
      const gen = stabilizeGenRef.current;
      nodesDs.clear();
      edgesDs.clear();
      if (nodes.length) nodesDs.add(nodes);
      if (edges.length) edgesDs.add(edges);

      if (nodes.length === 0 && edges.length === 0) {
        net.setOptions({
          interaction: { ...interactionOptions, dragNodes: true },
          nodes: { shape: "dot" as const },
          edges: { selectionWidth: 0, hoverWidth: 0 },
          layout: { hierarchical: { enabled: false } },
          physics: { enabled: false },
        });
        return;
      }

      if (isHierarchy) {
        net.setOptions({
          interaction: { ...interactionOptions, dragNodes: false },
          nodes: { shape: "dot" as const },
          edges: { selectionWidth: 0, hoverWidth: 0, smooth: false },
          ...getHierarchyLayoutOptions(hierarchicalSpacing),
        });

        let finished = false;
        const finish = () => {
          if (finished || stabilizeGenRef.current !== gen) return;
          finished = true;
          if (fitOnStabilized) {
            net.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" } });
          }
          onStabilized?.();
        };

        net.once("stabilizationIterationsDone", finish);
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
        window.setTimeout(finish, 200);
      } else if (isFlower) {
        net.setOptions({
          interaction: { ...interactionOptions, dragNodes: true },
          layout: { hierarchical: { enabled: false } },
          physics: { enabled: false },
          nodes: { shape: "dot" as const },
          edges: {
            selectionWidth: 0,
            hoverWidth: 0,
            smooth: { enabled: true, type: "dynamic", roundness: 0.42 },
          },
        });

        let finished = false;
        const finish = () => {
          if (finished || stabilizeGenRef.current !== gen) return;
          finished = true;
          if (fitOnStabilized) {
            net.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
          }
          onStabilized?.();
        };

        net.once("stabilizationIterationsDone", finish);
        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
        window.setTimeout(finish, 220);
      } else {
        net.setOptions({
          interaction: { ...interactionOptions, dragNodes: true },
          nodes: { shape: "dot" as const },
          edges: { selectionWidth: 0, hoverWidth: 0 },
          layout: { hierarchical: { enabled: false } },
          physics: { ...physics, enabled: true },
        });
        net.once("stabilizationIterationsDone", () => {
          if (stabilizeGenRef.current !== gen) return;
          net.setOptions({ physics: { enabled: false } });
          if (fitOnStabilized) {
            net.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" } });
          }
          onStabilized?.();
        });
      }
    } else {
      net.setOptions({
        interaction: { ...interactionOptions, dragNodes: !isHierarchy || isFlower },
        ...(isHierarchy
          ? {
              edges: { selectionWidth: 0, hoverWidth: 0, smooth: false },
              ...getHierarchyLayoutOptions(hierarchicalSpacing),
              physics: { enabled: false },
            }
          : isFlower
            ? {
                layout: { hierarchical: { enabled: false } },
                physics: { enabled: false },
                edges: {
                  selectionWidth: 0,
                  hoverWidth: 0,
                  smooth: { enabled: true, type: "dynamic", roundness: 0.42 },
                },
              }
            : {
                layout: { hierarchical: { enabled: false } },
                edges: { selectionWidth: 0, hoverWidth: 0 },
              }),
      });
      nodesDs.update(nodes);
      edgesDs.update(edges);
    }
  }, [
    nodes,
    edges,
    mode,
    resolvedLayout,
    isHierarchy,
    isFlower,
    physics,
    fitOnStabilized,
    onStabilized,
    hierarchicalSpacing,
    layoutTuningKey,
  ]);

  const zoomIn = useCallback(() => {
    const net = networkRef.current;
    if (!net) return;
    const scale = net.getScale();
    if (typeof scale !== "number") return;
    const pos = net.getViewPosition();
    net.moveTo({
      position: pos ?? undefined,
      scale: Math.min(scale * ZOOM_FACTOR, 50),
      animation: { duration: 200, easingFunction: "easeOutQuad" },
    });
  }, []);

  const zoomOut = useCallback(() => {
    const net = networkRef.current;
    if (!net) return;
    const scale = net.getScale();
    if (typeof scale !== "number") return;
    const pos = net.getViewPosition();
    net.moveTo({
      position: pos ?? undefined,
      scale: Math.max(scale / ZOOM_FACTOR, 0.1),
      animation: { duration: 200, easingFunction: "easeOutQuad" },
    });
  }, []);

  const fit = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
  }, []);

  const exportCanvas = useCallback(() => {
    if (!networkRef.current) return null;
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  }, []);

  useEffect(() => {
    const w = window as unknown as Record<string, (() => string | null) | undefined>;
    w[exportWindowKey] = exportCanvas;
    return () => {
      delete w[exportWindowKey];
    };
  }, [exportCanvas, exportWindowKey]);

  /** Position meta-theme sector labels at subtree centroids (canvas → DOM), updates on pan/zoom/drag. */
  useLayoutEffect(() => {
    const net = networkRef.current;
    const edgesDs = edgesDsRef.current;
    if (
      !net ||
      !edgesDs ||
      !isFlower ||
      !showMetaThemeSectorLabels ||
      !metaThemeSectorLabels?.length
    ) {
      return;
    }

    let raf = 0;
    const updatePositions = () => {
      const rawEdges = edgesDs.get();
      const childrenMap = buildChildrenMapFromEdges(rawEdges);
      let positions: ReturnType<Network["getPositions"]>;
      try {
        positions = net.getPositions();
      } catch {
        return;
      }

      for (const { id, label: _l } of metaThemeSectorLabels) {
        const el = metaSectorLabelElsRef.current.get(id);
        if (!el) continue;
        const subtreeIds = collectSubtreeIds(id, childrenMap);
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const nid of subtreeIds) {
          const p = positions[nid as keyof typeof positions] as { x: number; y: number } | undefined;
          if (p && typeof p.x === "number" && typeof p.y === "number") {
            sx += p.x;
            sy += p.y;
            n++;
          }
        }
        if (n === 0) {
          el.style.visibility = "hidden";
          continue;
        }
        el.style.visibility = "visible";
        const dom = net.canvasToDOM({ x: sx / n, y: sy / n });
        el.style.left = `${dom.x}px`;
        el.style.top = `${dom.y}px`;
      }
    };

    const onAfterDrawing = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        updatePositions();
      });
    };

    net.on("afterDrawing", onAfterDrawing);
    requestAnimationFrame(() => updatePositions());

    return () => {
      net.off("afterDrawing", onAfterDrawing);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isFlower, showMetaThemeSectorLabels, metaThemeSectorLabels, nodes, edges]);

  return (
    <div className="graph-view-wrap">
      <div className="graph-container">
        {/* vis-network appends to this div only — labels stay a React sibling overlay */}
        <div ref={containerRef} className="graph-container-vis" />
        {isFlower && showMetaThemeSectorLabels && metaThemeSectorLabels && metaThemeSectorLabels.length > 0 ? (
          <div className="graph-meta-sector-labels" role="region" aria-label="Meta theme regions">
            {metaThemeSectorLabels.map(({ id, label }) => (
              <div
                key={id}
                ref={(el) => {
                  if (el) metaSectorLabelElsRef.current.set(id, el);
                  else metaSectorLabelElsRef.current.delete(id);
                }}
                className="graph-meta-sector-label"
                title={label}
              >
                {label.length > 56 ? `${label.slice(0, 54)}…` : label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="graph-controls">
        <button type="button" className="graph-ctrl" onClick={zoomIn} title="Zoom in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
        <button type="button" className="graph-ctrl" onClick={zoomOut} title="Zoom out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
        <div className="graph-ctrl-divider" />
        <button type="button" className="graph-ctrl" onClick={fit} title="Fit to view">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}
