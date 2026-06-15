import type { ClusterEntry } from "./codebookReview";
import { SMALL_CODEBOOK_MAX_CLUSTERS } from "./codebookReview";

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
  codeCount: number;
}

export interface Codebook3DLayout {
  nodes: CodeNode3D[];
  hubs: ClusterHub3D[];
  /** Pairs of indices into `nodes` for intra-cluster edges. */
  edges: [number, number][];
  clusterCount: number;
  totalCodes: number;
  layoutRadius: number;
  suggestedCameraDistance: number;
  isLargeDataset: boolean;
}

const BASE_CLUSTER_RADIUS = 14;
const BASE_CODE_CLOUD_RADIUS = 2.8;

/** Spread clusters farther apart as count grows (44 clusters ≈ 2.4× base radius). */
export function clusterLayoutRadius(clusterCount: number): number {
  if (clusterCount <= 8) return BASE_CLUSTER_RADIUS;
  return BASE_CLUSTER_RADIUS * Math.pow(clusterCount / 8, 0.55);
}

export function suggestedCameraDistance(clusterCount: number, totalCodes: number): number {
  const r = clusterLayoutRadius(clusterCount);
  const codeBoost = totalCodes > 200 ? 10 : totalCodes > 80 ? 5 : 0;
  if (clusterCount <= 8) {
    return Math.max(16, r * 1.1 + Math.min(4, codeBoost));
  }
  return Math.max(32, r * 1.45 + codeBoost);
}

export function isLargeCodebookDataset(clusterCount: number, _totalCodes?: number): boolean {
  return clusterCount >= SMALL_CODEBOOK_MAX_CLUSTERS;
}

function clusterCentroid(index: number, total: number, radius: number): [number, number, number] {
  if (total <= 1) return [0, 0, 0];
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  const yScale = 0.55;
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta) * yScale,
    radius * Math.cos(phi),
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

function codeCloudRadius(codeCount: number, focused: boolean): number {
  if (codeCount <= 1) return 0;
  if (focused) {
    return Math.min(5.5, 1.4 + Math.sqrt(codeCount) * 0.55);
  }
  return Math.min(BASE_CODE_CLOUD_RADIUS, 1.2 + codeCount * 0.18);
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
  clusters: Record<string, ClusterEntry>,
  options?: {
    expandedClusterIds?: string[];
    forceShowAllCodes?: boolean;
    /** Full codebook cluster count — keeps overview mode when viewing a filtered subset. */
    totalClusterCount?: number;
  }
): Codebook3DLayout {
  const nodes: CodeNode3D[] = [];
  const hubs: ClusterHub3D[] = [];
  const n = sortedClusterIds.length;
  const layoutRadius = clusterLayoutRadius(n);
  const expanded = new Set(options?.expandedClusterIds ?? []);
  const forceShowAll = options?.forceShowAllCodes === true;
  const visibleCodes = sortedClusterIds.reduce(
    (sum, cid) => sum + (clusterToCodes[cid]?.length ?? 0),
    0
  );
  const fullClusterCount = options?.totalClusterCount ?? n;

  sortedClusterIds.forEach((cid, ci) => {
    const center = clusterCentroid(ci, n, layoutRadius);
    const color = clusterColor.get(cid) ?? "#7cf0d0";
    const entry = clusters[cid];
    const codes = clusterToCodes[cid] ?? [];
    const showCodes = forceShowAll || expanded.has(cid);
    const cloudR = showCodes ? codeCloudRadius(codes.length, expanded.size > 0) : 0;

    hubs.push({
      clusterId: cid,
      label: entry?.label || `Cluster ${cid}`,
      position: center,
      color,
      confidence: entry?.confidence ?? 0,
      codeCount: codes.length,
    });

    if (!showCodes) return;

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

  const large = forceShowAll
    ? false
    : isLargeCodebookDataset(fullClusterCount, visibleCodes);

  const cameraDistance = forceShowAll
    ? Math.max(
        32,
        layoutRadius * 1.45 +
          (visibleCodes > 200 ? 10 : visibleCodes > 80 ? 5 : 0)
      )
    : suggestedCameraDistance(n, visibleCodes);

  return {
    nodes,
    hubs,
    edges: buildIntraClusterEdges(nodes),
    clusterCount: n,
    totalCodes: visibleCodes,
    layoutRadius,
    suggestedCameraDistance: cameraDistance,
    isLargeDataset: large,
  };
}
