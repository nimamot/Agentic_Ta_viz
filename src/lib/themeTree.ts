import type { GraphData, GraphEdge, GraphNode, HierarchyRole } from "../types";
import { finalizeUndirectedGraph, stripCodeLabel } from "./hierarchicalGraphBuilder";

export interface ThemeTreeNode {
  name: string;
  type: string;
  children?: ThemeTreeNode[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isThemeTreeNode(n: unknown): n is ThemeTreeNode {
  if (!isRecord(n)) return false;
  if (typeof n.name !== "string" || typeof n.type !== "string") return false;
  if (n.children != null && !Array.isArray(n.children)) return false;
  return true;
}

/** Payload shape from pipeline exports: `{ tree: { name, type, children } }`. */
export function isThemeTreeDocument(value: unknown): value is { tree: ThemeTreeNode } {
  if (!isRecord(value)) return false;
  return isThemeTreeNode(value.tree);
}

function hierarchyRoleForType(t: string): HierarchyRole {
  const low = t.trim().toLowerCase().replace(/\s+/g, "_");
  if (low === "code" || low === "open_code" || low === "opencode" || low === "leaf" || low === "open_coded_code") {
    return "code";
  }
  if (low === "meta_theme") return "sub_theme";
  if (low === "root" || low === "theme") return "theme";
  return "sub_theme";
}

function nodeLabel(name: string): string {
  const s = stripCodeLabel(name);
  return s || name.trim().slice(0, 120) || "(empty)";
}

/**
 * Codebook tree → GraphData with hierarchy roles (top-down layout in GraphView).
 */
export function buildHierarchyGraphFromThemeTree(root: ThemeTreeNode): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nextId = 0;

  function dfs(n: ThemeTreeNode, parentId: number | null): void {
    const id = nextId++;
    const role = hierarchyRoleForType(n.type);
    const label = nodeLabel(n.name);
    nodes.push({
      id,
      label,
      title: n.name,
      aliases: [label],
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      componentId: 0,
      componentSize: 1,
      frequency: 0,
      provenance: role === "code" ? [n.name] : [],
      hierarchyRole: role,
      themeTreeType: n.type,
    });
    if (parentId != null) {
      edges.push({
        id: `tt-${parentId}-${id}-${edges.length}`,
        from: parentId,
        to: id,
        inferred: false,
      });
    }
    for (const c of n.children ?? []) {
      if (isThemeTreeNode(c)) dfs(c, id);
    }
  }

  dfs(root, null);
  return finalizeUndirectedGraph(nodes, edges);
}

/**
 * Same tree as a general graph (force-directed overview); no hierarchy roles.
 */
export function buildForceGraphFromThemeTree(root: ThemeTreeNode): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nextId = 0;

  function dfs(n: ThemeTreeNode, parentId: number | null): void {
    const id = nextId++;
    const label = nodeLabel(n.name);
    nodes.push({
      id,
      label,
      title: n.name,
      aliases: [label],
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      componentId: 0,
      componentSize: 1,
      frequency: 0,
      provenance: [],
    });
    if (parentId != null) {
      edges.push({
        id: `tf-${parentId}-${id}-${edges.length}`,
        from: parentId,
        to: id,
        inferred: false,
      });
    }
    for (const c of n.children ?? []) {
      if (isThemeTreeNode(c)) dfs(c, id);
    }
  }

  dfs(root, null);
  return finalizeUndirectedGraph(nodes, edges);
}
