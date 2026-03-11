import { useEffect, useRef, useCallback, useState } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { VisNode, VisEdge } from "../types";
import { getOverviewPhysicsOptions, getFocusPhysicsOptions } from "../lib/graphBuilder";

const ORBIT_RADIUS = 100;
const ORBIT_SPEED = 0.0012;
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
  const orbitAngleRef = useRef(0);
  const orbitCenterRef = useRef<{ x: number; y: number } | null>(null);
  const orbitFrameRef = useRef<number | null>(null);
  onNodeSelectRef.current = onNodeSelect;

  const [orbitOn, setOrbitOn] = useState(true);

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
      const pos = net.getViewPosition();
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        orbitCenterRef.current = { x: pos.x, y: pos.y };
      }
      onStabilized?.();
    });
    networkRef.current = net;
    return () => {
      if (orbitFrameRef.current != null) cancelAnimationFrame(orbitFrameRef.current);
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
      const net = networkRef.current;
      if (net) {
        const pos = net.getViewPosition();
        if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
          orbitCenterRef.current = { x: pos.x, y: pos.y };
        }
      }
      onStabilized?.();
    });
  }, [nodes, edges, physics, fitOnStabilized, onStabilized]);

  useEffect(() => {
    if (!orbitOn || !networkRef.current) return;
    const net = networkRef.current;
    function tick() {
      const center = orbitCenterRef.current;
      if (!center) {
        orbitFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const scale = net.getScale();
      if (typeof scale !== "number" || scale <= 0) {
        orbitFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      orbitAngleRef.current += ORBIT_SPEED;
      const x = center.x + ORBIT_RADIUS * Math.cos(orbitAngleRef.current);
      const y = center.y + ORBIT_RADIUS * Math.sin(orbitAngleRef.current);
      net.moveTo({ position: { x, y }, scale, animation: false });
      orbitFrameRef.current = requestAnimationFrame(tick);
    }
    orbitFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (orbitFrameRef.current != null) cancelAnimationFrame(orbitFrameRef.current);
      orbitFrameRef.current = null;
    };
  }, [orbitOn]);

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
    const net = networkRef.current;
    if (net) {
      const pos = net.getViewPosition();
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        orbitCenterRef.current = { x: pos.x, y: pos.y };
      }
    }
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
        <button
          type="button"
          className={`graph-ctrl graph-ctrl-orbit ${orbitOn ? "active" : ""}`}
          onClick={() => setOrbitOn((o) => !o)}
          title={orbitOn ? "Pause orbit" : "Orbit"}
        >
          ◐
        </button>
      </div>
    </div>
  );
}
