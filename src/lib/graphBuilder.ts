import type { CodebookJson, GraphData, GraphEdge, GraphNode, VisNode, VisEdge, FocusSubgraph } from "../types";

const CLUSTER_COLORS = [
  "#c9a227", "#7dcfb6", "#89a6fb", "#f28c8c",
  "#c792ea", "#70d6ff", "#f4b860", "#90be6d",
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

export function scaleNodeSize(degree: number): number {
  return 11 + Math.min(20, Math.sqrt(degree || 0) * 4.3);
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
    return node.degree >= Math.max(3, Math.ceil(maxDegree * 0.35));
  };

  return data.nodes.map((node) => {
    const highlighted = node.id === selectedNodeId;
    const baseColor = colorClusters ? getClusterColor(node.componentId) : "#4a4a58";
    return {
      id: node.id,
      label: shouldShowLabel(node) ? node.label : "",
      title: node.label,
      size: highlighted ? scaleNodeSize(node.degree) + 5 : scaleNodeSize(node.degree),
      color: {
        background: highlighted ? "#c9a227" : baseColor,
        border: highlighted ? "#f2d263" : "#68687a",
        highlight: { background: "#c9a227", border: "#f2d263" },
        hover: { background: highlighted ? "#d4af2e" : baseColor, border: "#d4af2e" },
      },
      font: {
        face: "DM Sans, system-ui, sans-serif",
        size: highlighted ? 15 : 12,
        color: "#efece8",
        strokeWidth: 0,
      },
      borderWidth: highlighted ? 2.5 : 1,
      shadow: highlighted,
    };
  });
}

export function buildEdgeStyle(
  edge: GraphEdge,
  emphasized: boolean,
  isDark: boolean
): VisEdge {
  const dim = isDark ? "rgba(148, 148, 168, 0.16)" : "rgba(80, 80, 100, 0.35)";
  const dimInferred = isDark ? "rgba(120, 120, 138, 0.12)" : "rgba(100, 100, 120, 0.2)";
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    arrows: "to",
    smooth: { type: "continuous", roundness: 0.42 },
    width: emphasized ? 1.8 : 1,
    color: {
      color: edge.inferred ? (emphasized ? "rgba(201, 162, 39, 0.7)" : dimInferred) : (emphasized ? "rgba(201, 162, 39, 0.7)" : dim),
      highlight: "#c9a227",
      hover: "#c9a227",
    },
    ...(edge.inferred ? { dashes: [4, 5] as number[] } : {}),
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
      selectedNodeId != null && (edge.from === selectedNodeId || edge.to === selectedNodeId);
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
    let background = isDark ? "#404050" : "#5a5a6e";
    if (isCenter) background = "#c9a227";
    else if (level === 1) background = colorClusters ? getClusterColor(node.componentId) : (isDark ? "#5a5a6b" : "#6a6a7e");
    else background = isDark ? "rgba(110, 110, 124, 0.78)" : "rgba(120, 120, 140, 0.85)";

    return {
      id: nodeId,
      label: node.label,
      title: node.label,
      size: isCenter ? Math.max(26, scaleNodeSize(node.degree) + 7) : Math.max(16, scaleNodeSize(node.degree) - (level === 2 ? 3 : 0)),
      color: {
        background,
        border: isCenter ? "#f2d263" : "#74748a",
        highlight: { background: "#c9a227", border: "#f2d263" },
        hover: { background: "#d4af2e", border: "#f2d263" },
      },
      font: {
        face: "DM Sans, system-ui, sans-serif",
        size: isCenter ? 16 : 13,
        color: isDark ? "#f2efeb" : "#1a1a1e",
        strokeWidth: 0,
      },
      borderWidth: isCenter ? 3 : 1.5,
      shadow: isCenter,
      mass: isCenter ? 2.4 : 1,
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
    stabilization: { enabled: true, iterations: 350, updateInterval: 25, fit: true },
    forceAtlas2Based: {
      gravitationalConstant: -85,
      centralGravity: 0.005,
      springLength: 190,
      springConstant: 0.035,
      damping: 0.55,
      avoidOverlap: 1.35,
    },
    maxVelocity: 18,
    minVelocity: 0.2,
  };
}

export function getFocusPhysicsOptions() {
  return {
    enabled: true,
    solver: "forceAtlas2Based" as const,
    stabilization: { enabled: true, iterations: 220, fit: true },
    forceAtlas2Based: {
      gravitationalConstant: -120,
      centralGravity: 0.015,
      springLength: 175,
      springConstant: 0.04,
      damping: 0.5,
      avoidOverlap: 1.5,
    },
    maxVelocity: 22,
    minVelocity: 0.2,
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
