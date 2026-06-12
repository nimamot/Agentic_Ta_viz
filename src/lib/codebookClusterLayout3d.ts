import type { ClusterEntry } from "./codebookReview";

export interface CodeNode3D {
  code: string;
  clusterId: string;
  position: [number, number, number];
  color: string;
}

export interface ClusterHub3D {
  clusterId: string;
  label: string;
  position: [number, number, number];
  color: string;
  confidence: number;
}

export interface Codebook3DLayout {
  nodes: CodeNode3D[];
  hubs: ClusterHub3D[];
  /** Pairs of indices into `nodes` for intra-cluster edges. */
  edges: [number, number][];
}

const CLUSTER_RADIUS = 14;
const CODE_CLOUD_RADIUS = 2.8;

function clusterCentroid(index: number, total: number): [number, number, number] {
  if (total <= 1) return [0, 0, 0];
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  const yScale = 0.55;
  return [
    CLUSTER_RADIUS * Math.sin(phi) * Math.cos(theta),
    CLUSTER_RADIUS * Math.sin(phi) * Math.sin(theta) * yScale,
    CLUSTER_RADIUS * Math.cos(phi),
  ];
}

/** Fibonacci sphere — stable, even distribution of codes around a cluster hub. */
function codeOffset(index: number, total: number, radius: number): [number, number, number] {
  if (total <= 1) return [0, 0, 0];
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 1);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ];
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Connect each node to up to `k` nearest neighbors within the same cluster. */
function buildIntraClusterEdges(nodes: CodeNode3D[], k = 3): [number, number][] {
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const byCluster = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const arr = byCluster.get(n.clusterId) ?? [];
    arr.push(i);
    byCluster.set(n.clusterId, arr);
  });

  for (const indices of byCluster.values()) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const neighbors = indices
        .filter((j) => j !== i)
        .map((j) => ({ j, d: dist(nodes[i].position, nodes[j].position) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, k);
      for (const { j } of neighbors) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([i, j]);
        }
      }
    }
  }
  return edges;
}

export function buildCodebook3DLayout(
  sortedClusterIds: string[],
  clusterToCodes: Record<string, string[]>,
  clusterColor: Map<string, string>,
  clusters: Record<string, ClusterEntry>
): Codebook3DLayout {
  const nodes: CodeNode3D[] = [];
  const hubs: ClusterHub3D[] = [];
  const n = sortedClusterIds.length;

  sortedClusterIds.forEach((cid, ci) => {
    const center = clusterCentroid(ci, n);
    const color = clusterColor.get(cid) ?? "#7cf0d0";
    const entry = clusters[cid];
    const codes = clusterToCodes[cid] ?? [];
    const cloudR = Math.min(CODE_CLOUD_RADIUS, 1.2 + codes.length * 0.22);

    hubs.push({
      clusterId: cid,
      label: entry?.label || `Cluster ${cid}`,
      position: center,
      color,
      confidence: entry?.confidence ?? 0,
    });

    codes.forEach((code, ki) => {
      const offset = codeOffset(ki, codes.length, cloudR);
      nodes.push({
        code,
        clusterId: cid,
        position: add(center, offset),
        color,
      });
    });
  });

  return { nodes, hubs, edges: buildIntraClusterEdges(nodes) };
}
