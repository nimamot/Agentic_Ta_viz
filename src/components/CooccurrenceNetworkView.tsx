import { useCallback, useEffect, useRef } from "react";
import { DataSet, Network } from "vis-network/standalone";
import { getOverviewPhysicsOptions } from "../lib/graphBuilder";
import type { CooccurrenceVisEdge, CooccurrenceVisNode } from "../lib/cooccurrence";

const ZOOM_FACTOR = 1.4;

type OccNode = CooccurrenceVisNode;
type OccEdge = CooccurrenceVisEdge;

function networkColors(isDark: boolean) {
  return {
    nodeFont: isDark ? "#e2e8f0" : "#0f172a",
    nodeBg: isDark ? "rgba(124,240,208,0.35)" : "rgba(0,153,128,0.22)",
    nodeBorder: isDark ? "#5ad8c4" : "#009980",
    edge: isDark ? "rgba(148,163,184,0.42)" : "rgba(71,85,105,0.38)",
    edgeHighlight: isDark ? "#7cf0d0" : "#009980",
  };
}

const interactionOptions = {
  hover: true,
  tooltipDelay: 120,
  zoomView: true,
  zoomSpeed: 1.15,
  dragView: true,
  dragNodes: true,
  selectConnectedEdges: true,
  multiselect: false,
  selectable: true,
} as const;

interface CooccurrenceNetworkViewProps {
  nodes: OccNode[];
  edges: OccEdge[];
  isDark: boolean;
  exportWindowKey?: string;
  fitOnStabilized?: boolean;
}

export function CooccurrenceNetworkView({
  nodes,
  edges,
  isDark,
  exportWindowKey = "__graphExport_cooccurrence",
  fitOnStabilized = true,
}: CooccurrenceNetworkViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<OccNode> | null>(null);
  const edgesDsRef = useRef<DataSet<OccEdge> | null>(null);
  const topologyRef = useRef<string>("");
  const stabilizeGenRef = useRef(0);

  const physics = getOverviewPhysicsOptions();

  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDs = new DataSet<OccNode>([]);
    const edgesDs = new DataSet<OccEdge>([]);
    nodesDsRef.current = nodesDs;
    edgesDsRef.current = edgesDs;

    const c = networkColors(isDark);
    const net = new Network(
      containerRef.current,
      { nodes: nodesDs, edges: edgesDs } as Parameters<Network["setData"]>[0],
      {
        autoResize: true,
        nodes: {
          shape: "dot" as const,
          scaling: {
            min: 10,
            max: 36,
            label: { min: 11, max: 20, maxVisible: 36, drawThreshold: 5 },
          },
          font: { color: c.nodeFont, size: 13, face: "system-ui, sans-serif" },
          borderWidth: 2,
          color: {
            background: c.nodeBg,
            border: c.nodeBorder,
            highlight: { background: c.nodeBg, border: c.edgeHighlight },
            hover: { background: c.nodeBg, border: c.edgeHighlight },
          },
        },
        edges: {
          selectionWidth: 0.5,
          hoverWidth: 0.5,
          arrows: { to: { enabled: false } },
          smooth: { enabled: true, type: "continuous", roundness: 0.35 },
          color: {
            color: c.edge,
            highlight: c.edgeHighlight,
            hover: c.edgeHighlight,
            inherit: false,
          },
        },
        physics: { enabled: false },
        interaction: { ...interactionOptions },
      }
    );

    networkRef.current = net;
    return () => {
      net.destroy();
      networkRef.current = null;
      nodesDsRef.current = null;
      edgesDsRef.current = null;
      topologyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const net = networkRef.current;
    const nodesDs = nodesDsRef.current;
    const edgesDs = edgesDsRef.current;
    if (!net || !nodesDs || !edgesDs) return;

    const fp = `${nodes.map((n) => n.id).sort().join(",")}|${edges.map((e) => e.id).sort().join(",")}`;
    const topologyChanged = fp !== topologyRef.current;
    topologyRef.current = fp;

    const c = networkColors(isDark);
    net.setOptions({
      nodes: {
        font: { color: c.nodeFont, size: 13, face: "system-ui, sans-serif" },
        color: {
          background: c.nodeBg,
          border: c.nodeBorder,
          highlight: { background: c.nodeBg, border: c.edgeHighlight },
          hover: { background: c.nodeBg, border: c.edgeHighlight },
        },
      },
      edges: {
        color: {
          color: c.edge,
          highlight: c.edgeHighlight,
          hover: c.edgeHighlight,
          inherit: false,
        },
      },
    });

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
          physics: { enabled: false },
        });
        return;
      }

      net.setOptions({
        interaction: { ...interactionOptions, dragNodes: true },
        layout: { hierarchical: { enabled: false } },
        physics: { ...physics, enabled: true },
      });
      net.once("stabilizationIterationsDone", () => {
        if (stabilizeGenRef.current !== gen) return;
        net.setOptions({ physics: { enabled: false } });
        if (fitOnStabilized) {
          net.fit({ animation: { duration: 380, easingFunction: "easeInOutQuad" } });
        }
      });
    } else {
      nodesDs.update(nodes);
      edgesDs.update(edges);
    }
  }, [nodes, edges, isDark, physics, fitOnStabilized]);

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

  return (
    <div className="graph-view-wrap">
      <div ref={containerRef} className="graph-container" />
      <div className="graph-controls">
        <button type="button" className="graph-ctrl" onClick={zoomIn} title="Zoom in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="graph-ctrl" onClick={zoomOut} title="Zoom out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="graph-ctrl-divider" />
        <button type="button" className="graph-ctrl" onClick={fit} title="Fit to view">
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
}
