import { useEffect, useRef, useCallback, useMemo } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { VisNode, VisEdge } from "../types";
import { getOverviewPhysicsOptions, getFocusPhysicsOptions } from "../lib/graphBuilder";

const ZOOM_FACTOR = 1.4;

const interactionOptions = {
  hover: true,
  tooltipDelay: 100,
  zoomView: true,
  zoomSpeed: 1.2,
  dragView: true,
  dragNodes: true,
  selectConnectedEdges: false,
} as const;

function topologyFingerprint(nodes: VisNode[], edges: VisEdge[]): string {
  const n = nodes
    .map((x) => x.id)
    .sort((a, b) => a - b)
    .join(",");
  const e = edges
    .map((x) => `${x.from}->${x.to}:${x.id}`)
    .sort()
    .join("|");
  return `${n}#${e}`;
}

interface GraphViewProps {
  nodes: VisNode[];
  edges: VisEdge[];
  mode: "overview" | "focus" | "hierarchy";
  onNodeSelect: (nodeId: number) => void;
  onStabilized?: () => void;
  fitOnStabilized?: boolean;
}

export function GraphView({
  nodes,
  edges,
  mode,
  onNodeSelect,
  onStabilized,
  fitOnStabilized = true,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<VisNode> | null>(null);
  const edgesDsRef = useRef<DataSet<VisEdge> | null>(null);
  const topologyRef = useRef<string | null>(null);
  const stabilizeGenRef = useRef(0);
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;

  const physics = useMemo(
    () =>
      mode === "focus" ? getFocusPhysicsOptions() : getOverviewPhysicsOptions(),
    [mode]
  );

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
        edges: { selectionWidth: 0, hoverWidth: 0 },
        physics: { enabled: false },
        interaction: { ...interactionOptions },
      }
    );

    net.on("click", (params) => {
      if (params.nodes.length) onNodeSelectRef.current(params.nodes[0]);
    });

    networkRef.current = net;
    return () => {
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

    const fp = topologyFingerprint(nodes, edges);
    const topologyChanged = fp !== topologyRef.current;
    topologyRef.current = fp;

    net.setOptions({ interaction: { ...interactionOptions } });

    if (topologyChanged) {
      stabilizeGenRef.current += 1;
      const gen = stabilizeGenRef.current;
      nodesDs.clear();
      edgesDs.clear();
      if (nodes.length) nodesDs.add(nodes);
      if (edges.length) edgesDs.add(edges);

      if (nodes.length === 0 && edges.length === 0) {
        net.setOptions({ physics: { enabled: false } });
        return;
      }

      net.setOptions({ physics: { ...physics, enabled: true } });
      net.once("stabilizationIterationsDone", () => {
        if (stabilizeGenRef.current !== gen) return;
        net.setOptions({ physics: { enabled: false } });
        if (fitOnStabilized) {
          net.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" } });
        }
        onStabilized?.();
      });
    } else {
      nodesDs.update(nodes);
      edgesDs.update(edges);
    }
  }, [nodes, edges, physics, fitOnStabilized, onStabilized]);

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
    (window as unknown as { __graphExport?: () => string | null }).__graphExport = exportCanvas;
    return () => {
      delete (window as unknown as { __graphExport?: () => string | null }).__graphExport;
    };
  }, [exportCanvas]);

  return (
    <div className="graph-view-wrap">
      <div ref={containerRef} className="graph-container" />
      <div className="graph-controls">
        <button type="button" className="graph-ctrl" onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button type="button" className="graph-ctrl" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button type="button" className="graph-ctrl" onClick={fit} title="Fit graph">
          ⊡
        </button>
      </div>
    </div>
  );
}
