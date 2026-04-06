import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Edge,
  type Node,
  type NodeTypes,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { pipelineManifest } from "../lib/pipelineManifest";
import { PipelineNodeComponent } from "./PipelineNode";
import { PipelineDetailPanel } from "./PipelineDetailPanel";

/** Must match `.pipeline-node` box in CSS — React Flow uses this for bounds / fitView. */
const PIPELINE_NODE_W = 216;
const PIPELINE_NODE_H = 196;

const nodeTypes: NodeTypes = {
  pipeline: PipelineNodeComponent,
};

const loopSet = new Set(pipelineManifest.loopPairs.flat());

const VALIDATOR_IDS = new Set<string>(["validate_open_codes", "refine"]);

/**
 * Multi-row grid so the graph fits a full slide/viewport height-wise:
 * row 0 — ingest → open → axial → high-level
 * row 1 — validators under the stages they gate
 * row 2 — hierarchy → meta-themes → report (spread to match top width)
 */
function buildLayoutNodes(selected: string | null): Node[] {
  const W = PIPELINE_NODE_W;
  const H = PIPELINE_NODE_H;
  const GX = 36;
  const GY = 48;
  const stepX = W + GX;
  const stepY = H + GY;

  const spine = [
    "ingest",
    "open_coding",
    "axial",
    "high_level",
    "hierarchy",
    "meta_themes",
    "research_report",
  ] as const;

  const result: Node[] = [];

  const push = (
    id: string,
    x: number,
    y: number,
    extra: { isValidator?: boolean; isLoopMember?: boolean } = {}
  ) => {
    const pNode = pipelineManifest.nodes.find((n) => n.id === id);
    if (!pNode) return;
    result.push({
      id,
      type: "pipeline",
      position: { x, y },
      width: W,
      height: H,
      data: {
        pipelineNode: pNode,
        selected: id === selected,
        isLoopMember: extra.isLoopMember ?? loopSet.has(id),
        isValidator: extra.isValidator ?? VALIDATOR_IDS.has(id),
      },
      draggable: true,
    });
  };

  const ocIdx = spine.indexOf("open_coding");
  const hlIdx = spine.indexOf("high_level");

  spine.slice(0, 4).forEach((id, i) => push(id, i * stepX, 0));

  const valNode = pipelineManifest.nodes.find((n) => n.id === "validate_open_codes");
  if (valNode) {
    result.push({
      id: "validate_open_codes",
      type: "pipeline",
      position: { x: ocIdx * stepX, y: stepY },
      width: W,
      height: H,
      data: {
        pipelineNode: valNode,
        selected: selected === "validate_open_codes",
        isLoopMember: true,
        isValidator: true,
      },
      draggable: true,
    });
  }

  const refineNode = pipelineManifest.nodes.find((n) => n.id === "refine");
  if (refineNode) {
    result.push({
      id: "refine",
      type: "pipeline",
      position: { x: hlIdx * stepX, y: stepY },
      width: W,
      height: H,
      data: {
        pipelineNode: refineNode,
        selected: selected === "refine",
        isLoopMember: false,
        isValidator: true,
      },
      draggable: true,
    });
  }

  const topSpan = hlIdx * stepX + W;
  const row2Y = 2 * stepY;
  push("hierarchy", 0, row2Y);
  push("meta_themes", 1.5 * stepX, row2Y);
  push("research_report", Math.max(0, topSpan - W), row2Y);

  return result;
}

function handlesForEdge(e: (typeof pipelineManifest.edges)[number]): {
  sourceHandle?: string;
  targetHandle?: string;
} {
  if (e.source === "ingest" && e.target === "open_coding") {
    return { targetHandle: "in" };
  }
  if (e.source === "open_coding" && e.target === "validate_open_codes") {
    return { sourceHandle: "submit", targetHandle: "submit-in" };
  }
  if (e.source === "validate_open_codes" && e.target === "open_coding") {
    return { sourceHandle: "retry-out", targetHandle: "retry-in" };
  }
  if (e.source === "validate_open_codes" && e.target === "axial") {
    return { sourceHandle: "pass-out" };
  }
  return {};
}

function buildLayoutEdges(isDark: boolean): Edge[] {
  /** Single stroke for all edges so the graph reads as one flow (node cards keep role colors). */
  const edgeStroke = isDark ? "rgba(200, 208, 245, 0.82)" : "rgba(72, 78, 102, 0.88)";

  return pipelineManifest.edges.map((e, i): Edge => {
    const isLoop = pipelineManifest.loopPairs.some(
      ([a, b]) =>
        (e.source === a && e.target === b) || (e.source === b && e.target === a)
    );

    const { sourceHandle, targetHandle } = handlesForEdge(e);

    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      animated: e.animated ?? false,
      label: e.label,
      type: "smoothstep",
      style: {
        stroke: edgeStroke,
        strokeWidth: isLoop ? 2.85 : 2.35,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: edgeStroke,
      },
      labelStyle: {
        fill: isDark ? "#e4e8ff" : "#0c0e2a",
        fontSize: 12,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 700,
      },
      labelBgStyle: {
        fill: isDark ? "#0c0d1a" : "#f0f2ff",
        fillOpacity: 0.92,
      },
      labelBgPadding: [8, 5] as [number, number],
      labelBgBorderRadius: 6,
    };
  });
}

function fitPipeline(
  instance: { fitView: (opts?: object) => Promise<boolean> },
  presentationEmbed?: boolean
) {
  requestAnimationFrame(() => {
    void instance.fitView({
      padding: presentationEmbed ? 0.22 : 0.08,
      minZoom: 0.15,
      maxZoom: presentationEmbed ? 1.35 : 1.45,
      duration: 280,
    });
  });
}

interface PipelineViewProps {
  isDark: boolean;
  /** When true, sits inside a scroll-snap slide: no outer theme wrapper duplication, gentler wheel zoom. */
  presentationEmbed?: boolean;
}

export function PipelineView({ isDark, presentationEmbed }: PipelineViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rf, setRf] = useState<{ fitView: (opts?: object) => Promise<boolean> } | null>(null);

  const selectedPNode = useMemo(
    () => pipelineManifest.nodes.find((n) => n.id === selectedId) ?? null,
    [selectedId]
  );

  const initialNodes = useMemo(() => buildLayoutNodes(selectedId), [selectedId]);
  const initialEdges = useMemo(() => buildLayoutEdges(isDark), [isDark]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(buildLayoutNodes(selectedId));
  }, [selectedId, setNodes]);

  useEffect(() => {
    setEdges(buildLayoutEdges(isDark));
  }, [isDark, setEdges]);

  useEffect(() => {
    if (!rf) return;
    fitPipeline(rf, presentationEmbed);
  }, [rf, nodes.length, presentationEmbed]);

  useEffect(() => {
    if (!rf) return;
    const onResize = () => fitPipeline(rf, presentationEmbed);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [rf, presentationEmbed]);

  const onInit = useCallback(
    (instance: { fitView: (opts?: object) => Promise<boolean> }) => {
      setRf(instance);
      fitPipeline(instance, presentationEmbed);
    },
    [presentationEmbed]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  return (
    <div
      className={`pipeline-page ${presentationEmbed ? "pipeline-page--embed" : ""}`}
      data-theme={isDark ? "dark" : "light"}
    >
      {!presentationEmbed && (
        <div className="pipeline-topbar">
          <div className="pipeline-topbar-left">
            <h2 className="pipeline-topbar-title">GT pipeline</h2>
            <span className="pipeline-topbar-sub">
              Colors = role: <strong>data</strong> · <strong>Qwen</strong> · <strong>validators</strong> ·{" "}
              <strong>embeddings/KMeans</strong> · <strong>Mistral</strong> · dashed row = validator agents · drag ·
              zoom
            </span>
          </div>
          <div className="pipeline-topbar-callout">
            <span className="pipeline-topbar-badge">Live</span>
            SGLang restarts between <strong>Qwen</strong>, <strong>embedding</strong>, and{" "}
            <strong>Mistral</strong> for VRAM
          </div>
        </div>
      )}

      <div className="pipeline-canvas-wrap">
        <div className="pipeline-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onInit={onInit}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            minZoom={presentationEmbed ? 0.12 : 0.25}
            maxZoom={presentationEmbed ? 1.35 : 2}
            proOptions={{ hideAttribution: true }}
            connectionLineType={ConnectionLineType.SmoothStep}
            zoomOnScroll={!presentationEmbed}
            zoomOnPinch
            elevateEdgesOnSelect
          >
            <Background
              color={isDark ? "rgba(99, 115, 255, 0.06)" : "rgba(74, 90, 255, 0.06)"}
              gap={36}
              size={1.2}
            />
          </ReactFlow>
        </div>
        {selectedPNode && (
          <PipelineDetailPanel
            node={selectedPNode}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
