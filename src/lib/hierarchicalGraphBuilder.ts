import type {
  GraphData,
  GraphEdge,
  GraphNode,
  HierarchicalClusterEntry,
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

/** Keys like `tree` / `meta` are ignored; remaining entries must be flat theme clusters. */
export function extractFlatHierarchicalClusters(value: unknown): HierarchicalCodebookJson | null {
  if (!isRecord(value)) return null;
  const skip = new Set(["tree", "meta", "edges", "inferred_edges", "canonical_nodes", "merge_groups"]);
  const out: HierarchicalCodebookJson = {};
  for (const k of Object.keys(value)) {
    if (skip.has(k)) continue;
    const entry = value[k];
    if (!isRecord(entry) || typeof entry.label !== "string") continue;
    if (entry.sub_themes != null && !Array.isArray(entry.sub_themes)) continue;
    if (entry.ungrouped_codes != null && !Array.isArray(entry.ungrouped_codes)) continue;
    let stOk = true;
    for (const st of entry.sub_themes ?? []) {
      if (!isRecord(st) || typeof st.name !== "string" || !Array.isArray(st.codes)) {
        stOk = false;
        break;
      }
      if (!st.codes.every((c) => typeof c === "string")) {
        stOk = false;
        break;
      }
    }
    if (!stOk) continue;
    if (!(entry.ungrouped_codes ?? []).every((c) => typeof c === "string")) continue;
    out[k] = entry as unknown as HierarchicalClusterEntry;
  }
  return Object.keys(out).length > 0 ? out : null;
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

  return finalizeUndirectedGraph(nodes, visEdges);
}

/** Compute adjacency, degrees, components, and node map from node/edge lists. */
export function finalizeUndirectedGraph(nodes: GraphNode[], visEdges: GraphEdge[]): GraphData {
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

/** Cosmic/teal palette — distinct per depth, consistent with app dark UI. */
const TREE_LEVEL_COLORS_DARK: { bg: string; border: string; hoverBg: string; hoverBorder: string; label: string }[] = [
  { bg: "rgba(124, 240, 208, 0.42)", border: "rgba(180, 255, 235, 0.95)", hoverBg: "rgba(124, 240, 208, 0.62)", hoverBorder: "rgba(200, 255, 240, 1)", label: "rgba(230, 255, 248, 0.95)" },
  { bg: "rgba(56, 189, 248, 0.36)", border: "rgba(147, 220, 255, 0.92)", hoverBg: "rgba(56, 189, 248, 0.55)", hoverBorder: "rgba(186, 230, 253, 1)", label: "rgba(224, 242, 254, 0.95)" },
  { bg: "rgba(137, 166, 251, 0.36)", border: "rgba(180, 195, 255, 0.9)", hoverBg: "rgba(137, 166, 251, 0.54)", hoverBorder: "rgba(199, 210, 254, 1)", label: "rgba(238, 242, 255, 0.94)" },
  { bg: "rgba(167, 139, 250, 0.34)", border: "rgba(210, 190, 255, 0.88)", hoverBg: "rgba(167, 139, 250, 0.52)", hoverBorder: "rgba(221, 214, 254, 1)", label: "rgba(245, 243, 255, 0.94)" },
  { bg: "rgba(77, 233, 176, 0.34)", border: "rgba(150, 245, 210, 0.88)", hoverBg: "rgba(77, 233, 176, 0.52)", hoverBorder: "rgba(167, 250, 215, 1)", label: "rgba(236, 253, 245, 0.95)" },
  { bg: "rgba(45, 212, 191, 0.32)", border: "rgba(120, 235, 220, 0.86)", hoverBg: "rgba(45, 212, 191, 0.5)", hoverBorder: "rgba(153, 246, 228, 1)", label: "rgba(230, 252, 248, 0.94)" },
];

const TREE_LEVEL_COLORS_LIGHT: { bg: string; border: string; hoverBg: string; hoverBorder: string; label: string }[] = [
  { bg: "rgba(13, 148, 136, 0.38)", border: "rgba(15, 118, 110, 0.95)", hoverBg: "rgba(13, 148, 136, 0.52)", hoverBorder: "rgba(13, 99, 90, 1)", label: "rgba(15, 40, 38, 0.95)" },
  { bg: "rgba(3, 105, 161, 0.34)", border: "rgba(7, 89, 133, 0.92)", hoverBg: "rgba(3, 105, 161, 0.48)", hoverBorder: "rgba(12, 74, 110, 1)", label: "rgba(15, 35, 55, 0.95)" },
  { bg: "rgba(67, 56, 202, 0.28)", border: "rgba(55, 48, 163, 0.9)", hoverBg: "rgba(67, 56, 202, 0.42)", hoverBorder: "rgba(49, 46, 129, 1)", label: "rgba(30, 27, 75, 0.95)" },
  { bg: "rgba(109, 40, 217, 0.26)", border: "rgba(91, 33, 182, 0.88)", hoverBg: "rgba(109, 40, 217, 0.4)", hoverBorder: "rgba(76, 29, 149, 1)", label: "rgba(40, 25, 65, 0.95)" },
  { bg: "rgba(5, 150, 105, 0.32)", border: "rgba(4, 120, 87, 0.9)", hoverBg: "rgba(5, 150, 105, 0.46)", hoverBorder: "rgba(6, 95, 70, 1)", label: "rgba(15, 45, 35, 0.95)" },
  { bg: "rgba(14, 116, 144, 0.3)", border: "rgba(14, 94, 120, 0.88)", hoverBg: "rgba(14, 116, 144, 0.44)", hoverBorder: "rgba(12, 74, 95, 1)", label: "rgba(15, 38, 48, 0.95)" },
];

export type BuildHierarchyVisOptions = {
  /** When set (e.g. Library global tree), nodes are tinted by depth from root instead of cluster color. */
  treeDepthByNodeId?: Map<number, number>;
  treeTheme?: "dark" | "light";
  /** Canvas label per node id (e.g. Library short root when JSON root `name` duplicates the research question). */
  canvasLabelByNodeId?: Map<number, string>;
};

function treeExplorationFontSize(
  depth: number,
  highlighted: boolean,
  role: HierarchyRole | undefined,
  themeRowOnly: boolean
): number {
  let base = Math.round(Math.max(10, 14 - depth * 0.75 + (role === "theme" ? 1.5 : 0)));
  if (themeRowOnly && depth === 0) base = Math.min(18, base + 4);
  return highlighted ? Math.min(16, base + 1) : base;
}

function treeLabelMaxWidth(depth: number, themeRowOnly: boolean): number {
  if (themeRowOnly && depth <= 0) return 400;
  if (depth <= 0) return 320;
  if (depth === 1) return 260;
  if (depth === 2) return 220;
  return 190;
}

export function buildHierarchyVisNodes(
  data: GraphData,
  selectedNodeId: number | null,
  showLabels: boolean,
  colorClusters: boolean,
  options?: BuildHierarchyVisOptions
): VisNode[] {
  const maxDegree = data.nodes.reduce((m, n) => Math.max(m, n.degree), 0);
  const depthMap = options?.treeDepthByNodeId;
  const treeExploration = depthMap != null;

  const shouldShowLabel = (node: GraphNode) => {
    if (showLabels) return true;
    if (treeExploration) {
      if (selectedNodeId === node.id) return true;
      const d = depthMap?.get(node.id) ?? 0;
      if (d === 0) return true;
      const hasChildren = data.edges.some((e) => e.from === node.id);
      return hasChildren;
    }
    if (selectedNodeId === node.id) return true;
    if (maxDegree <= 0) return false;
    const role = node.hierarchyRole;
    if (role === "theme" || role === "sub_theme") return true;
    return node.degree >= Math.max(3, Math.ceil(maxDegree * 0.25));
  };

  const theme = options?.treeTheme ?? "dark";
  const levelPalette = theme === "light" ? TREE_LEVEL_COLORS_LIGHT : TREE_LEVEL_COLORS_DARK;

  const depthMax =
    depthMap != null && depthMap.size > 0 ? Math.max(...Array.from(depthMap.values())) : 0;
  /** Stripped top + no expansion: siblings share no edges — main themes in a row. */
  const themeRowOnly = treeExploration && data.edgeCount === 0 && data.nodes.length > 0;
  /** At least one edge but still shallow (e.g. one theme expanded). */
  const shallowExpanded = treeExploration && data.edgeCount > 0 && depthMax <= 1;

  return data.nodes.map((node) => {
    const highlighted = node.id === selectedNodeId;
    const clusterColor = getClusterColor(node.componentId);
    const clusterColorDim = getClusterColorDim(node.componentId);
    const role = node.hierarchyRole;
    const depth = depthMap?.get(node.id) ?? 0;
    const levelStyle = depthMap != null ? levelPalette[depth % levelPalette.length] : null;

    const baseColor = levelStyle
      ? levelStyle.bg
      : colorClusters
        ? clusterColorDim
        : "rgba(74, 90, 255, 0.5)";
    const baseBorder = levelStyle ? levelStyle.border : colorClusters ? clusterColor : "rgba(74, 90, 255, 0.7)";
    const hoverBg = levelStyle ? levelStyle.hoverBg : clusterColor;
    const hoverBorder = levelStyle ? levelStyle.hoverBorder : clusterColor;
    const labelColor = highlighted ? "#b8fff0" : levelStyle ? levelStyle.label : "rgba(220, 228, 255, 0.85)";

    const ac = node.aliases.length;
    let baseSize = roleBaseSize(role, node.degree, ac);
    if (treeExploration) {
      baseSize = Math.round(baseSize + Math.max(0, 3 - depth) * 1.8 + (role === "theme" ? 6 : role === "sub_theme" ? 3 : 0));
    }
    if (themeRowOnly && depth === 0) {
      baseSize = Math.max(baseSize + 28, 54);
    } else if (shallowExpanded) {
      if (depth === 0) baseSize = Math.round(baseSize + 14);
      else if (depth === 1) baseSize = Math.round(baseSize + 6);
    }
    const titleHint =
      role === "code" && node.provenance.length
        ? `${node.title}\n(raw: ${node.provenance[0]})`
        : node.title;

    const canvasOverride = options?.canvasLabelByNodeId?.get(node.id);
    const displayLabel = canvasOverride ?? node.label;

    const fullTitle =
      canvasOverride != null
        ? `${node.label}${titleHint !== node.label ? `\n${titleHint}` : ""}`
        : treeExploration && node.label && node.label !== titleHint
          ? `${node.label}\n${titleHint}`
          : titleHint;

    const shadow: VisNode["shadow"] = highlighted
      ? { enabled: true, color: "rgba(124, 240, 208, 0.5)", size: 14, x: 0, y: 0 }
      : themeRowOnly && depth === 0
        ? { enabled: true, color: "rgba(124, 240, 208, 0.35)", size: 20, x: 0, y: 0 }
        : false;

    const fontSize = treeExploration
      ? treeExplorationFontSize(depth, highlighted, role, themeRowOnly)
      : highlighted
        ? 13
        : role === "code"
          ? 10
          : role === "sub_theme"
            ? 11
            : 12;

    const visNode: VisNode = {
      id: node.id,
      label: shouldShowLabel(node) ? displayLabel : "",
      title: fullTitle,
      size: highlighted ? baseSize + 6 : baseSize,
      color: {
        background: highlighted ? "#7cf0d0" : baseColor,
        border: highlighted ? "#b8fff0" : baseBorder,
        highlight: { background: "#7cf0d0", border: "#b8fff0" },
        hover: {
          background: highlighted ? "#9df5da" : hoverBg,
          border: highlighted ? "#b8fff0" : hoverBorder,
        },
      },
      font: {
        face: "Space Mono, monospace",
        size: fontSize,
        multi: treeExploration ? true : undefined,
        color: labelColor,
        strokeWidth: treeExploration ? 2.5 : 3,
        strokeColor: theme === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(5, 6, 15, 0.9)",
      },
      borderWidth: highlighted ? 2.5 : themeRowOnly && depth === 0 ? 2.8 : role === "theme" ? 2 : 1.2,
      shadow,
    };

    if (treeExploration && shouldShowLabel(node)) {
      visNode.widthConstraint = { maximum: treeLabelMaxWidth(depth, themeRowOnly) };
    }

    return visNode satisfies VisNode;
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
    return {
      ...buildEdgeStyle(edge, emphasized, isDark),
      smooth: false,
    } satisfies VisEdge;
  });
}
