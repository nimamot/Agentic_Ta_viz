import type {
  GraphData,
  GraphEdge,
  GraphNode,
  HierarchicalCodebookJson,
  HierarchyRole,
  VisEdge,
  VisNode,
} from "../types";
import { buildEdgeStyle, getClusterColor, getClusterColorDim, scaleNodeSize } from "./graphBuilder";

function createEmptyNeighborSetMap(ids: number[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  ids.forEach((id) => map.set(id, new Set()));
  return map;
}

function incrementMapCount(map: Map<number, number>, key: number): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Trim surrounding double quotes from serialized code strings. */
export function stripCodeLabel(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  return t;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function isHierarchicalCodebookJson(value: unknown): value is HierarchicalCodebookJson {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  for (const k of keys) {
    const entry = value[k];
    if (!isRecord(entry)) return false;
    if (typeof entry.label !== "string") return false;
    if (entry.sub_themes != null && !Array.isArray(entry.sub_themes)) return false;
    if (entry.ungrouped_codes != null && !Array.isArray(entry.ungrouped_codes)) return false;
    for (const st of entry.sub_themes ?? []) {
      if (!isRecord(st) || typeof st.name !== "string" || !Array.isArray(st.codes)) return false;
      if (!st.codes.every((c) => typeof c === "string")) return false;
    }
    if (!(entry.ungrouped_codes ?? []).every((c) => typeof c === "string")) return false;
  }
  return true;
}

function sortClusterKeys(keys: string[]): string[] {
  return keys.slice().sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a && String(nb) === b) {
      return na - nb;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/**
 * Theme → sub-theme → code, and theme → ungrouped code.
 * Each top-level cluster is a disconnected tree (its own connected component).
 */
export function buildHierarchicalGraphData(json: HierarchicalCodebookJson): GraphData {
  const clusterKeys = sortClusterKeys(Object.keys(json));
  const nodes: GraphNode[] = [];
  const visEdges: GraphEdge[] = [];
  let nextId = 0;

  const pushNode = (
    label: string,
    title: string,
    role: HierarchyRole,
    provenance: string[]
  ): number => {
    const id = nextId++;
    nodes.push({
      id,
      label,
      title,
      aliases: [label],
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      componentId: 0,
      componentSize: 1,
      frequency: 0,
      provenance,
      hierarchyRole: role,
    });
    return id;
  };

  const pushEdge = (from: number, to: number): void => {
    const id = `ht-${from}-${to}-${visEdges.length}`;
    visEdges.push({ id, from, to, inferred: false });
  };

  clusterKeys.forEach((clusterKey) => {
    const entry = json[clusterKey];
    const themeLabel = entry.label.trim() || `Cluster ${clusterKey}`;
    const themeTitle = `[${clusterKey}] ${themeLabel}`;
    const themeId = pushNode(themeLabel, themeTitle, "theme", []);

    (entry.sub_themes ?? []).forEach((st) => {
      const subName = (st.name ?? "").trim() || "Untitled sub-theme";
      const subId = pushNode(subName, `${themeTitle} → ${subName}`, "sub_theme", []);
      pushEdge(themeId, subId);
      (st.codes ?? []).forEach((raw) => {
        const display = stripCodeLabel(raw) || "(empty code)";
        const codeId = pushNode(display, display, "code", [raw]);
        pushEdge(subId, codeId);
      });
    });

    (entry.ungrouped_codes ?? []).forEach((raw) => {
      const display = stripCodeLabel(raw) || "(empty code)";
      const codeId = pushNode(display, display, "code", [raw]);
      pushEdge(themeId, codeId);
    });
  });

  const nodeIds = nodes.map((n) => n.id);
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

  nodeIds.forEach((idx) => {
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

  nodes.forEach((node) => {
    node.degree = totalDegree.get(node.id) ?? 0;
    node.inDegree = inDegree.get(node.id) ?? 0;
    node.outDegree = outDegree.get(node.id) ?? 0;
    node.componentId = componentByNode.get(node.id) ?? 0;
    node.componentSize = componentSizes.get(node.componentId) ?? 1;
  });

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

function roleBaseSize(role: HierarchyRole | undefined, degree: number, aliasCount: number): number {
  const base = scaleNodeSize(degree, aliasCount);
  if (role === "theme") return Math.max(28, base + 10);
  if (role === "sub_theme") return Math.max(18, base + 4);
  return Math.max(10, base - 2);
}

export function buildHierarchyVisNodes(
  data: GraphData,
  selectedNodeId: number | null,
  showLabels: boolean,
  colorClusters: boolean
): VisNode[] {
  const maxDegree = data.nodes.reduce((m, n) => Math.max(m, n.degree), 0);
  const shouldShowLabel = (node: GraphNode) => {
    if (showLabels) return true;
    if (selectedNodeId === node.id) return true;
    if (maxDegree <= 0) return false;
    const role = node.hierarchyRole;
    if (role === "theme" || role === "sub_theme") return true;
    return node.degree >= Math.max(3, Math.ceil(maxDegree * 0.25));
  };

  return data.nodes.map((node) => {
    const highlighted = node.id === selectedNodeId;
    const clusterColor = getClusterColor(node.componentId);
    const clusterColorDim = getClusterColorDim(node.componentId);
    const role = node.hierarchyRole;
    const baseColor = colorClusters ? clusterColorDim : "rgba(74, 90, 255, 0.5)";
    const baseBorder = colorClusters ? clusterColor : "rgba(74, 90, 255, 0.7)";
    const ac = node.aliases.length;
    const baseSize = roleBaseSize(role, node.degree, ac);
    const titleHint =
      role === "code" && node.provenance.length
        ? `${node.title}\n(raw: ${node.provenance[0]})`
        : node.title;

    const shadow: VisNode["shadow"] = highlighted
      ? { enabled: true, color: "rgba(124, 240, 208, 0.5)", size: 14, x: 0, y: 0 }
      : false;

    return {
      id: node.id,
      label: shouldShowLabel(node) ? node.label : "",
      title: titleHint,
      size: highlighted ? baseSize + 6 : baseSize,
      color: {
        background: highlighted ? "#7cf0d0" : baseColor,
        border: highlighted ? "#b8fff0" : baseBorder,
        highlight: { background: "#7cf0d0", border: "#b8fff0" },
        hover: { background: highlighted ? "#9df5da" : clusterColor, border: clusterColor },
      },
      font: {
        face: "Space Mono, monospace",
        size: highlighted ? 13 : role === "code" ? 10 : role === "sub_theme" ? 11 : 12,
        color: highlighted ? "#b8fff0" : "rgba(220, 228, 255, 0.85)",
        strokeWidth: 3,
        strokeColor: "rgba(5, 6, 15, 0.9)",
      },
      borderWidth: highlighted ? 2.5 : role === "theme" ? 2 : 1.2,
      shadow,
    } satisfies VisNode;
  });
}

export function buildHierarchyVisEdges(
  data: GraphData,
  selectedNodeId: number | null,
  isDark: boolean
): VisEdge[] {
  return data.edges.map((edge) => {
    const emphasized =
      selectedNodeId != null && (edge.from === selectedNodeId || edge.to === selectedNodeId);
    return buildEdgeStyle(edge, emphasized, isDark);
  });
}
