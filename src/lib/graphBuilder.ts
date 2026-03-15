import type { CodebookJson, GraphData, GraphEdge, GraphNode, VisNode, VisEdge, FocusSubgraph } from "../types";

// Evocative palette: deep cosmic hues that glow well on dark backgrounds
const CLUSTER_COLORS = [
  "#7cf0d0", // teal
  "#89a6fb", // periwinkle
  "#ff7eb3", // rose
  "#ffd166", // amber
  "#a78bfa", // violet
  "#4de9b0", // mint
  "#f97316", // orange
  "#38bdf8", // sky
  "#e879f9", // fuchsia
  "#a3e635", // lime
];

const CLUSTER_COLORS_DIM = [
  "rgba(124,240,208,0.55)",
  "rgba(137,166,251,0.55)",
  "rgba(255,126,179,0.55)",
  "rgba(255,209,102,0.55)",
  "rgba(167,139,250,0.55)",
  "rgba(77,233,176,0.55)",
  "rgba(249,115,22,0.55)",
  "rgba(56,189,248,0.55)",
  "rgba(232,121,249,0.55)",
  "rgba(163,230,53,0.55)",
];

function buildRepresentativeMap(mergeGroups: string[][], canonicalNodes: string[]): Map<string, string> {
  const canonicalSet = new Set(canonicalNodes ?? []);
  const repr = new Map<string, string>();
  (mergeGroups ?? []).forEach((group) => {
    const preferred = group.find((name) => canonicalSet.has(name));
    const representative = preferred !== undefined ? preferred : group[0];
    group.forEach((name) => repr.set(name, representative));
  });
  return repr;
}

function resolveName(name: string, reprMap: Map<string, string>): string {
  return reprMap.get(name) ?? name;
}

function createEmptyNeighborSetMap(ids: number[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  ids.forEach((id) => map.set(id, new Set()));
  return map;
}

function incrementMapCount(map: Map<number, number>, key: number): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildGraphData(json: CodebookJson): GraphData {
  const canonicalNodes = json.canonical_nodes ?? [];
  const mergeGroups = json.merge_groups ?? [];
  const edges = json.edges ?? [];
  const inferredEdges = json.inferred_edges ?? [];
  const reprMap = buildRepresentativeMap(mergeGroups, canonicalNodes);
  const aliasMap = new Map<string, Set<string>>();
  const nodeLabels = new Set<string>();

  canonicalNodes.forEach((name) => nodeLabels.add(resolveName(name, reprMap)));

  mergeGroups.forEach((group) => {
    if (!group.length) return;
    const representative = resolveName(group[0], reprMap);
    const aliases = aliasMap.get(representative) ?? new Set([representative]);
    group.forEach((name) => {
      aliases.add(name);
      nodeLabels.add(resolveName(name, reprMap));
    });
    aliasMap.set(representative, aliases);
  });

  function normalizeEdge(
    edge: { parent: string; child: string },
    inferred: boolean
  ): { parent: string; child: string; inferred: boolean } | null {
    const parent = resolveName(edge.parent, reprMap);
    const child = resolveName(edge.child, reprMap);
    if (!parent || !child || parent === child) return null;
    nodeLabels.add(parent);
    nodeLabels.add(child);
    return { parent, child, inferred };
  }

  const directEdgesRaw = edges.map((e) => normalizeEdge(e, false)).filter(Boolean) as { parent: string; child: string; inferred: boolean }[];
  const inferredEdgesRaw = inferredEdges.map((e) => normalizeEdge(e, true)).filter(Boolean) as { parent: string; child: string; inferred: boolean }[];

  const labels = Array.from(nodeLabels);
  const idToIndex = new Map<string, number>();
  labels.forEach((label, index) => {
    idToIndex.set(label, index);
    if (!aliasMap.has(label)) aliasMap.set(label, new Set([label]));
  });

  const directKeySet = new Set<string>();
  const visEdges: GraphEdge[] = [];

  directEdgesRaw.forEach((edge) => {
    const from = idToIndex.get(edge.parent);
    const to = idToIndex.get(edge.child);
    if (from == null || to == null) return;
    const key = `${from},${to}`;
    if (directKeySet.has(key)) return;
    directKeySet.add(key);
    visEdges.push({ id: `d-${key}`, from, to, inferred: false });
  });

  inferredEdgesRaw.forEach((edge) => {
    const from = idToIndex.get(edge.parent);
    const to = idToIndex.get(edge.child);
    if (from == null || to == null) return;
    const key = `${from},${to}`;
    if (directKeySet.has(key)) return;
    visEdges.push({ id: `i-${key}`, from, to, inferred: true });
  });

  const nodeIds = labels.map((_, idx) => idx);
  const inNeighbors = createEmptyNeighborSetMap(nodeIds);
  const outNeighbors = createEmptyNeighborSetMap(nodeIds);
  const undirectedNeighbors = createEmptyNeighborSetMap(nodeIds);
  const inDegree = new Map<number, number>();
  const outDegree = new Map<number, number>();
  const totalDegree = new Map<number, number>();

  visEdges.forEach((edge) => {
    outNeighbors.get(edge.from)!.add(edge.to);
    inNeighbors.get(edge.to)!.add(edge.from);
    undirectedNeighbors.get(edge.from)!.add(edge.to);
    undirectedNeighbors.get(edge.to)!.add(edge.from);
    incrementMapCount(outDegree, edge.from);
    incrementMapCount(inDegree, edge.to);
    incrementMapCount(totalDegree, edge.from);
    incrementMapCount(totalDegree, edge.to);
  });

  const componentByNode = new Map<number, number>();
  const componentSizes = new Map<number, number>();
  let componentId = 0;

  labels.forEach((_, idx) => {
    if (componentByNode.has(idx)) return;
    const queue = [idx];
    componentByNode.set(idx, componentId);
    let size = 0;
    while (queue.length) {
      const current = queue.shift()!;
      size += 1;
      undirectedNeighbors.get(current)!.forEach((next) => {
        if (componentByNode.has(next)) return;
        componentByNode.set(next, componentId);
        queue.push(next);
      });
    }
    componentSizes.set(componentId, size);
    componentId += 1;
  });

  const nodes: GraphNode[] = labels.map((label, index) => ({
    id: index,
    label,
    title: label,
    aliases: Array.from(aliasMap.get(label) ?? [label]).sort(),
    degree: totalDegree.get(index) ?? 0,
    inDegree: inDegree.get(index) ?? 0,
    outDegree: outDegree.get(index) ?? 0,
    componentId: componentByNode.get(index) ?? 0,
    componentSize: componentSizes.get(componentByNode.get(index) ?? 0) ?? 1,
  }));

  const nodeMap = new Map<number, GraphNode>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  return {
    nodes,
    edges: visEdges,
    nodeMap,
    nodeCount: nodes.length,
    edgeCount: visEdges.length,
    adjacency: {
      incoming: inNeighbors,
      outgoing: outNeighbors,
      undirected: undirectedNeighbors,
    },
  };
}

export function getClusterColor(componentId: number): string {
  return CLUSTER_COLORS[componentId % CLUSTER_COLORS.length];
}

export function getClusterColorDim(componentId: number): string {
  return CLUSTER_COLORS_DIM[componentId % CLUSTER_COLORS_DIM.length];
}

export function scaleNodeSize(degree: number): number {
  return 9 + Math.min(22, Math.sqrt(degree || 0) * 5);
}

export function buildOverviewNodes(
  data: GraphData,
  selectedNodeId: number | null,
  showLabels: boolean,
  colorClusters: boolean
): VisNode[] {
  const maxDegree = data.nodes.reduce((max, n) => Math.max(max, n.degree), 0);

  const shouldShowLabel = (node: GraphNode) => {
    if (showLabels) return true;
    if (selectedNodeId === node.id) return true;
    if (maxDegree <= 0) return false;
    return node.degree >= Math.max(4, Math.ceil(maxDegree * 0.38));
  };

  return data.nodes.map((node) => {
    const highlighted = node.id === selectedNodeId;
    const clusterColor = getClusterColor(node.componentId);
    const clusterColorDim = getClusterColorDim(node.componentId);
    const baseColor = colorClusters ? clusterColorDim : "rgba(74, 90, 255, 0.5)";
    const baseBorder = colorClusters ? clusterColor : "rgba(74, 90, 255, 0.7)";

    return {
      id: node.id,
      label: shouldShowLabel(node) ? node.label : "",
      title: node.label,
      size: highlighted ? scaleNodeSize(node.degree) + 6 : scaleNodeSize(node.degree),
      color: {
        background: highlighted ? "#7cf0d0" : baseColor,
        border: highlighted ? "#b8fff0" : baseBorder,
        highlight: { background: "#7cf0d0", border: "#b8fff0" },
        hover: { background: highlighted ? "#9df5da" : clusterColor, border: clusterColor },
      },
      font: {
        face: "Space Mono, monospace",
        size: highlighted ? 13 : 11,
        color: highlighted ? "#b8fff0" : "rgba(220, 228, 255, 0.85)",
        strokeWidth: 3,
        strokeColor: "rgba(5, 6, 15, 0.9)",
      },
      borderWidth: highlighted ? 2.5 : 1.2,
      shadow: highlighted
        ? { enabled: true, color: "rgba(124, 240, 208, 0.5)", size: 14, x: 0, y: 0 }
        : false,
    };
  });
}

export function buildEdgeStyle(
  edge: GraphEdge,
  emphasized: boolean,
  isDark: boolean
): VisEdge {
  const directDim = isDark
    ? "rgba(99, 115, 255, 0.2)"
    : "rgba(74, 90, 200, 0.3)";
  const inferredDim = isDark
    ? "rgba(99, 115, 255, 0.1)"
    : "rgba(74, 90, 200, 0.15)";
  const emphColor = "rgba(124, 240, 208, 0.75)";

  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    arrows: "to",
    smooth: { type: "continuous", roundness: 0.38 },
    width: emphasized ? 2 : (edge.inferred ? 0.8 : 1),
    color: {
      color: edge.inferred
        ? (emphasized ? emphColor : inferredDim)
        : (emphasized ? emphColor : directDim),
      highlight: "#7cf0d0",
      hover: "#7cf0d0",
    },
    ...(edge.inferred ? { dashes: [4, 6] as number[] } : {}),
  };
}

export function getVisibleEdges(data: GraphData, showInferred: boolean): GraphEdge[] {
  if (showInferred) return data.edges.slice();
  return data.edges.filter((e) => !e.inferred);
}

export function buildOverviewEdges(
  data: GraphData,
  selectedNodeId: number | null,
  showInferred: boolean,
  isDark: boolean
): VisEdge[] {
  return getVisibleEdges(data, showInferred).map((edge) => {
    const emphasized =
      selectedNodeId != null &&
      (edge.from === selectedNodeId || edge.to === selectedNodeId);
    return buildEdgeStyle(edge, emphasized, isDark);
  });
}

export function collectNeighborhood(
  data: GraphData,
  centerId: number,
  depth: number
): { visited: Set<number>; levels: Map<number, number> } {
  const visited = new Set<number>([centerId]);
  const levels = new Map<number, number>();
  levels.set(centerId, 0);
  let frontier: number[] = [centerId];
  for (let step = 1; step <= depth; step += 1) {
    const next: number[] = [];
    frontier.forEach((nodeId) => {
      data.adjacency.undirected.get(nodeId)!.forEach((neighborId) => {
        if (visited.has(neighborId)) return;
        visited.add(neighborId);
        levels.set(neighborId, step);
        next.push(neighborId);
      });
    });
    frontier = next;
  }
  return { visited, levels };
}

export function buildFocusSubgraph(
  data: GraphData,
  selectedNodeId: number,
  depth: number,
  showInferred: boolean,
  colorClusters: boolean,
  isDark: boolean
): FocusSubgraph {
  const neighborhood = collectNeighborhood(data, selectedNodeId, depth);
  const visibleEdges = getVisibleEdges(data, showInferred).filter(
    (edge) => neighborhood.visited.has(edge.from) && neighborhood.visited.has(edge.to)
  );

  const nodes: VisNode[] = Array.from(neighborhood.visited).map((nodeId) => {
    const node = data.nodeMap.get(nodeId)!;
    const level = neighborhood.levels.get(nodeId) ?? 0;
    const isCenter = nodeId === selectedNodeId;
    const clusterColor = getClusterColor(node.componentId);
    const clusterColorDim = getClusterColorDim(node.componentId);

    let bg: string, border: string;
    if (isCenter) {
      bg = "#7cf0d0";
      border = "#b8fff0";
    } else if (level === 1) {
      bg = colorClusters ? clusterColorDim : (isDark ? "rgba(74,90,255,0.55)" : "rgba(74,90,200,0.65)");
      border = colorClusters ? clusterColor : (isDark ? "rgba(99,115,255,0.8)" : "rgba(74,90,200,0.9)");
    } else {
      bg = isDark ? "rgba(74,90,255,0.28)" : "rgba(74,90,200,0.35)";
      border = isDark ? "rgba(99,115,255,0.45)" : "rgba(74,90,200,0.5)";
    }

    return {
      id: nodeId,
      label: node.label,
      title: node.label,
      size: isCenter
        ? Math.max(28, scaleNodeSize(node.degree) + 8)
        : Math.max(14, scaleNodeSize(node.degree) - (level === 2 ? 4 : 0)),
      color: {
        background: bg,
        border,
        highlight: { background: "#7cf0d0", border: "#b8fff0" },
        hover: { background: "#9df5da", border: "#7cf0d0" },
      },
      font: {
        face: "Space Mono, monospace",
        size: isCenter ? 14 : 12,
        color: isDark ? "#e4e8ff" : "#0c0e2a",
        strokeWidth: 3,
        strokeColor: isDark ? "rgba(5,6,15,0.95)" : "rgba(240,242,255,0.95)",
      },
      borderWidth: isCenter ? 3 : 1.5,
      shadow: isCenter
        ? { enabled: true, color: "rgba(124,240,208,0.6)", size: 18, x: 0, y: 0 }
        : false,
      mass: isCenter ? 2.5 : 1,
    };
  });

  const edges: VisEdge[] = visibleEdges.map((edge) => {
    const nearSelected = edge.from === selectedNodeId || edge.to === selectedNodeId;
    return buildEdgeStyle(edge, nearSelected, isDark);
  });

  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length, depth };
}

export function getOverviewPhysicsOptions() {
  return {
    enabled: true,
    solver: "forceAtlas2Based" as const,
    stabilization: { enabled: true, iterations: 400, updateInterval: 25, fit: true },
    forceAtlas2Based: {
      gravitationalConstant: -90,
      centralGravity: 0.004,
      springLength: 200,
      springConstant: 0.03,
      damping: 0.52,
      avoidOverlap: 1.4,
    },
    maxVelocity: 20,
    minVelocity: 0.18,
  };
}

export function getFocusPhysicsOptions() {
  return {
    enabled: true,
    solver: "forceAtlas2Based" as const,
    stabilization: { enabled: true, iterations: 240, fit: true },
    forceAtlas2Based: {
      gravitationalConstant: -130,
      centralGravity: 0.018,
      springLength: 185,
      springConstant: 0.042,
      damping: 0.48,
      avoidOverlap: 1.5,
    },
    maxVelocity: 24,
    minVelocity: 0.18,
  };
}

export function computeGraphStats(data: GraphData): {
  nodeCount: number;
  edgeCount: number;
  componentCount: number;
  density: number;
  maxDegree: number;
  directEdgeCount: number;
  inferredEdgeCount: number;
} {
  const directEdgeCount = data.edges.filter((e) => !e.inferred).length;
  const inferredEdgeCount = data.edges.filter((e) => e.inferred).length;
  const n = data.nodeCount;
  const maxDegree = data.nodes.reduce((max, node) => Math.max(max, node.degree), 0);
  const componentIds = new Set(data.nodes.map((node) => node.componentId));
  const density = n <= 1 ? 0 : data.edgeCount / (n * (n - 1));
  return {
    nodeCount: n,
    edgeCount: data.edgeCount,
    componentCount: componentIds.size,
    density: Math.round(density * 10000) / 10000,
    maxDegree,
    directEdgeCount,
    inferredEdgeCount,
  };
}
