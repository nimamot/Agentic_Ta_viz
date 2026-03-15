import { useEffect, useRef, useCallback } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { VisNode, VisEdge } from "../types";
import { getOverviewPhysicsOptions, getFocusPhysicsOptions } from "../lib/graphBuilder";

const ZOOM_FACTOR = 1.4;

interface GraphViewProps {
  nodes: VisNode[];
  edges: VisEdge[];
  mode: "overview" | "focus";
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
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;

  const physics = mode === "overview" ? getOverviewPhysicsOptions() : getFocusPhysicsOptions();

  useEffect(() => {
    if (!containerRef.current) return;
    const data = { nodes: new DataSet(nodes), edges: new DataSet(edges) } as Parameters<Network["setData"]>[0];
    const options = {
      autoResize: true,
      nodes: { shape: "dot" as const },
      edges: { selectionWidth: 0, hoverWidth: 0 },
      physics,
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        zoomSpeed: 1.2,
        dragView: true,
        dragNodes: true,
        selectConnectedEdges: false,
      },
    };
    const net = new Network(containerRef.current, data, options);
    net.on("click", (params) => {
      if (params.nodes.length) onNodeSelectRef.current(params.nodes[0]);
    });
    net.once("stabilizationIterationsDone", () => {
      net.setOptions({ physics: false });
      if (fitOnStabilized) net.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" } });
      onStabilized?.();
    });
    networkRef.current = net;
    return () => {
      net.destroy();
      networkRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!networkRef.current) return;
    networkRef.current.setOptions({ physics: true });
    networkRef.current.setData({ nodes: new DataSet(nodes), edges: new DataSet(edges) } as Parameters<Network["setData"]>[0]);
    networkRef.current.setOptions({ physics });
    networkRef.current.once("stabilizationIterationsDone", () => {
      networkRef.current?.setOptions({ physics: false });
      if (fitOnStabilized) networkRef.current?.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" } });
      onStabilized?.();
    });
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
