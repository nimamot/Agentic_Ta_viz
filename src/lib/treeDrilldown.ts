import type { GraphData, GraphEdge } from "../types";
import { finalizeUndirectedGraph } from "./hierarchicalGraphBuilder";

/** Directed tree: each child has exactly one parent edge (from → to). */
export function buildParentMapFromEdges(edges: GraphEdge[]): Map<number, number> {
  const m = new Map<number, number>();
  edges.forEach((e) => m.set(e.to, e.from));
  return m;
}

export function findDirectedTreeRootId(data: GraphData): number {
  const targets = new Set(data.edges.map((e) => e.to));
  const roots = data.nodes.filter((n) => !targets.has(n.id));
  return roots[0]?.id ?? data.nodes[0]?.id ?? 0;
}

/**
 * Keep only `centerId` and its direct children, and edges from center to each child.
 * Recomputes degrees / components for the subgraph.
 */
export function sliceTreeOneLevel(data: GraphData, centerId: number): GraphData {
  const childIds = data.edges.filter((e) => e.from === centerId).map((e) => e.to);
  const keep = new Set<number>([centerId, ...childIds]);
  const nodes = data.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n }));
  const edges = data.edges
    .filter((e) => e.from === centerId && keep.has(e.to))
    .map((e) => ({ ...e }));
  return finalizeUndirectedGraph(nodes, edges);
}

/** Nodes reachable from root when only `expanded` nodes may expose their outgoing edges. */
export function collectVisibleNodeIds(
  data: GraphData,
  rootId: number,
  expanded: ReadonlySet<number>
): Set<number> {
  const visible = new Set<number>();
  function walk(n: number): void {
    if (visible.has(n)) return;
    visible.add(n);
    if (!expanded.has(n)) return;
    for (const e of data.edges) {
      if (e.from === n) walk(e.to);
    }
  }
  walk(rootId);
  return visible;
}

/** Remove `nodeId` and every descendant from the expanded set (mutates `expanded`). */
export function removeExpandedSubtreeFromSet(
  expanded: Set<number>,
  data: GraphData,
  nodeId: number
): void {
  expanded.delete(nodeId);
  for (const e of data.edges) {
    if (e.from === nodeId) removeExpandedSubtreeFromSet(expanded, data, e.to);
  }
}

/** Subgraph of all visible nodes/edges under expand/collapse rules. */
export function sliceExpandedTree(data: GraphData, rootId: number, expanded: ReadonlySet<number>): GraphData {
  const visible = collectVisibleNodeIds(data, rootId, expanded);
  const nodes = data.nodes.filter((n) => visible.has(n.id)).map((n) => ({ ...n }));
  const edges = data.edges.filter((e) => visible.has(e.from) && visible.has(e.to)).map((e) => ({ ...e }));
  return finalizeUndirectedGraph(nodes, edges);
}

/** Count nodes at each depth; return the size of the widest level (siblings sharing a row). */
export function maxNodesOnAnyLevel(data: GraphData, rootId: number): number {
  const depths = computeDirectedDepthFromRoot(data, rootId);
  const counts = new Map<number, number>();
  for (const n of data.nodes) {
    const d = depths.get(n.id) ?? 0;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let m = 1;
  for (const c of counts.values()) m = Math.max(m, c);
  return m;
}

/** Largest out-degree in the directed tree (width of the busiest sibling row). */
export function maxDirectedChildFanOut(data: GraphData): number {
  const byParent = new Map<number, number>();
  for (const e of data.edges) {
    byParent.set(e.from, (byParent.get(e.from) ?? 0) + 1);
  }
  let m = 0;
  for (const c of byParent.values()) m = Math.max(m, c);
  return m;
}

/** BFS depth from `rootId` (0 = root) along directed edges (from → to). */
export function computeDirectedDepthFromRoot(data: GraphData, rootId: number): Map<number, number> {
  const depths = new Map<number, number>();
  const seen = new Set<number>();
  const q: number[] = [rootId];
  depths.set(rootId, 0);
  seen.add(rootId);
  while (q.length) {
    const n = q.shift()!;
    const d = depths.get(n)!;
    for (const e of data.edges) {
      if (e.from !== n || seen.has(e.to)) continue;
      seen.add(e.to);
      depths.set(e.to, d + 1);
      q.push(e.to);
    }
  }
  for (const n of data.nodes) {
    if (!depths.has(n.id)) depths.set(n.id, 0);
  }
  return depths;
}
