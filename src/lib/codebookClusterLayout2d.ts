import type { ClusterEntry } from "./codebookReview";
import type { HighlightedCode } from "../components/codebookClusterTypes";

export interface Codebook2DHub {
  clusterId: string;
  label: string;
  x: number;
  y: number;
  color: string;
  confidence: number;
  codeCount: number;
  radius: number;
}

export interface Codebook2DCodeNode {
  id: string;
  code: string;
  clusterId: string;
  x: number;
  y: number;
  nodeR: number;
  opacity: number;
  highlighted: boolean;
  dimmed: boolean;
  hidden: boolean;
}

export interface Codebook2DCluster {
  clusterId: string;
  label: string;
  fullLabel: string;
  color: string;
  x: number;
  y: number;
  radius: number;
  codeCount: number;
  confidence: number;
  overviewOnly: boolean;
  dimmed: boolean;
  dropTarget: boolean;
  labelAnchorY: number;
  codes: Codebook2DCodeNode[];
}

/** @deprecated */
export type Codebook2DClusterCard = Codebook2DCluster;
/** @deprecated */
export type Codebook2DIsland = Codebook2DCluster;

export interface Codebook2DLayout {
  clusters: Codebook2DCluster[];
  /** @deprecated */
  cards: Codebook2DCluster[];
  /** @deprecated */
  islands: Codebook2DCluster[];
  hubs: Codebook2DHub[];
  edges: [number, number][];
  codeIndex: Map<string, number>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  dropThreshold: number;
}

const GOLDEN = Math.PI * (1 + Math.sqrt(5));

/** Dense codebooks need expand/collapse even with few clusters. */
export function isDenseCodebookLayout(
  sortedClusterIds: string[],
  clusterToCodes: Record<string, string[]>
): boolean {
  if (sortedClusterIds.length === 0) return false;
  const total = sortedClusterIds.reduce((s, cid) => s + (clusterToCodes[cid]?.length ?? 0), 0);
  const maxInCluster = Math.max(...sortedClusterIds.map((cid) => clusterToCodes[cid]?.length ?? 0));
  return total > 36 || maxInCluster > 10;
}

function truncate(text: string, max = 32): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function codeNodeId(clusterId: string, code: string): string {
  return `code:${clusterId}:${code}`;
}

/** Even distribution on a disk — golden-angle spiral. */
function goldenDisk(index: number, total: number, maxR: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const r = maxR * Math.sqrt((index + 0.5) / total);
  const a = index * GOLDEN;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

function layoutSpread(clusterCount: number): number {
  if (clusterCount <= 1) return 0;
  if (clusterCount <= 4) return 155;
  if (clusterCount <= 8) return 200;
  return 165 + clusterCount * 22;
}

function overviewTerritoryRadius(codeCount: number): number {
  return 44 + Math.sqrt(Math.max(1, codeCount)) * 11;
}

function expandedCloudRadius(codeCount: number, multiExpanded: boolean): number {
  if (codeCount <= 1) return 0;
  const base = multiExpanded ? 0.82 : 1;
  return Math.min(92, (18 + Math.sqrt(codeCount) * 11) * base);
}

function territoryRadius(codeCount: number, overview: boolean, multiExpanded: boolean): number {
  if (overview) return overviewTerritoryRadius(codeCount);
  const cloud = expandedCloudRadius(codeCount, multiExpanded);
  return cloud + 22 + Math.min(18, codeCount * 0.35);
}

function nodeRadius(codeCount: number): number {
  if (codeCount <= 8) return 7;
  if (codeCount <= 18) return 6;
  if (codeCount <= 36) return 5;
  if (codeCount <= 60) return 4.2;
  return 3.5;
}

function placeClusterCenters(
  radii: number[],
  spread: number
): { x: number; y: number }[] {
  const n = radii.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  const positions = Array.from({ length: n }, (_, i) => {
    const p = goldenDisk(i, n, spread);
    return { x: p.x, y: p.y * 0.78 };
  });

  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const need = radii[i] + radii[j] + 36;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < need) {
          const push = (need - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          positions[i].x -= ux * push;
          positions[i].y -= uy * push;
          positions[j].x += ux * push;
          positions[j].y += uy * push;
        }
      }
    }
  }
  return positions;
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildIntraClusterEdges(codes: Codebook2DCodeNode[], k = 2): [number, number][] {
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  if (codes.length < 2) return edges;

  for (let i = 0; i < codes.length; i++) {
    const neighbors = codes
      .map((c, j) => ({ j, d: i === j ? Infinity : dist2(codes[i], c) }))
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
  return edges;
}

function buildCluster(
  clusterId: string,
  entry: ClusterEntry | undefined,
  color: string,
  codes: string[],
  center: { x: number; y: number },
  options: {
    overviewOnly: boolean;
    multiExpanded: boolean;
    highlighted: HighlightedCode | null;
    hasCodeFocus: boolean;
    highlightCluster: string | null;
    draggingCodeKey: string | null;
    dropTarget: boolean;
    totalCodeCount: number;
  }
): Codebook2DCluster {
  const {
    overviewOnly,
    multiExpanded,
    highlighted,
    hasCodeFocus,
    highlightCluster,
    draggingCodeKey,
    dropTarget,
    totalCodeCount,
  } = options;

  const label = entry?.label || `Cluster ${clusterId}`;
  const fullLabel = label.trim() || `Cluster ${clusterId}`;
  const overview = overviewOnly || codes.length === 0;
  const dimmed = !overview && hasCodeFocus && highlightCluster !== clusterId;
  const count = overview ? totalCodeCount : codes.length;
  const radius = territoryRadius(count, overview, multiExpanded);
  const nr = nodeRadius(count);
  const cloudR = overview ? 0 : expandedCloudRadius(codes.length, multiExpanded);

  const codeNodes: Codebook2DCodeNode[] = codes.map((code, i) => {
    const offset = goldenDisk(i, codes.length, cloudR);
    const nodeKey = `${clusterId}:${code}`;
    const isHighlighted = highlighted?.code === code && highlighted.clusterId === clusterId;
    return {
      id: codeNodeId(clusterId, code),
      code,
      clusterId,
      x: center.x + offset.x,
      y: center.y + offset.y,
      nodeR: nr,
      opacity: draggingCodeKey === nodeKey ? 0.2 : isHighlighted ? 1 : dimmed ? 0.38 : 0.92,
      highlighted: isHighlighted,
      dimmed,
      hidden: draggingCodeKey === nodeKey,
    };
  });

  return {
    clusterId,
    label: truncate(fullLabel),
    fullLabel,
    color,
    x: center.x,
    y: center.y,
    radius,
    codeCount: totalCodeCount,
    confidence: entry?.confidence ?? 0,
    overviewOnly: overview,
    dimmed,
    dropTarget,
    labelAnchorY: center.y - radius - 14,
    codes: codeNodes.filter((c) => !c.hidden),
  };
}

export function buildCodebook2DLayout(
  sortedClusterIds: string[],
  clusterToCodes: Record<string, string[]>,
  clusterColor: Map<string, string>,
  clusters: Record<string, ClusterEntry>,
  options: {
    overviewMode: boolean;
    expandedClusterIds: Set<string>;
    forceShowAllCodes: boolean;
    highlighted: HighlightedCode | null;
    dropTargetClusterId?: string | null;
    draggingCodeKey?: string | null;
  }
): Codebook2DLayout {
  const { overviewMode, expandedClusterIds, forceShowAllCodes, highlighted, dropTargetClusterId, draggingCodeKey } =
    options;

  const highlightCluster = highlighted?.clusterId ?? null;
  const hasCodeFocus = highlighted != null;
  const multiExpanded = expandedClusterIds.size > 1;

  const meta = sortedClusterIds.map((cid) => {
    const showCodes = forceShowAllCodes || expandedClusterIds.has(cid);
    const codes = showCodes && !overviewMode ? clusterToCodes[cid] ?? [] : [];
    const overview = !showCodes || codes.length === 0;
    const count = overview ? clusterToCodes[cid]?.length ?? 0 : codes.length;
    return { cid, showCodes, codes, overview, count };
  });

  const radii = meta.map((m) => territoryRadius(m.count, m.overview, multiExpanded));
  const spread = layoutSpread(sortedClusterIds.length);
  const centers = placeClusterCenters(radii, spread);

  const clusterList: Codebook2DCluster[] = [];
  const hubs: Codebook2DHub[] = [];
  const allCodes: Codebook2DCodeNode[] = [];
  const codeIndex = new Map<string, number>();
  const edges: [number, number][] = [];

  meta.forEach((m, index) => {
    const entry = clusters[m.cid];
    const color = clusterColor.get(m.cid) ?? "#7cf0d0";
    const center = centers[index] ?? { x: 0, y: 0 };
    const cluster = buildCluster(m.cid, entry, color, m.codes, center, {
      overviewOnly: !m.showCodes || m.codes.length === 0,
      multiExpanded,
      highlighted,
      hasCodeFocus,
      highlightCluster,
      draggingCodeKey: draggingCodeKey ?? null,
      dropTarget: dropTargetClusterId === m.cid,
      totalCodeCount: clusterToCodes[m.cid]?.length ?? 0,
    });
    clusterList.push(cluster);
    hubs.push({
      clusterId: m.cid,
      label: cluster.label,
      x: center.x,
      y: center.y,
      color,
      confidence: cluster.confidence,
      codeCount: cluster.codeCount,
      radius: cluster.radius,
    });

    const base = allCodes.length;
    const localEdges = buildIntraClusterEdges(cluster.codes);
    for (const [a, b] of localEdges) edges.push([base + a, base + b]);
    cluster.codes.forEach((c, i) => {
      codeIndex.set(c.id, base + i);
      allCodes.push(c);
    });
  });

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of clusterList) {
    minX = Math.min(minX, c.x - c.radius - 56);
    maxX = Math.max(maxX, c.x + c.radius + 56);
    minY = Math.min(minY, c.y - c.radius - 64);
    maxY = Math.max(maxY, c.y + c.radius + 40);
  }
  if (!isFinite(minX)) {
    minX = -200;
    maxX = 200;
    minY = -200;
    maxY = 200;
  }

  const maxRadius = Math.max(0, ...hubs.map((h) => h.radius));
  return {
    clusters: clusterList,
    cards: clusterList,
    islands: clusterList,
    hubs,
    edges,
    codeIndex,
    bounds: { minX, minY, maxX, maxY },
    dropThreshold: Math.max(52, maxRadius * 0.95),
  };
}

function pointInCluster(position: { x: number; y: number }, cluster: Codebook2DCluster, pad = 8): boolean {
  return Math.hypot(position.x - cluster.x, position.y - cluster.y) <= cluster.radius + pad;
}

export function nearestDropClusterId(
  position: { x: number; y: number },
  hubs: Codebook2DHub[],
  fromClusterId: string,
  _threshold: number,
  clusters?: Codebook2DCluster[]
): string | null {
  if (clusters?.length) {
    let best: { clusterId: string; d: number } | null = null;
    for (const c of clusters) {
      if (c.clusterId === fromClusterId) continue;
      if (!pointInCluster(position, c)) continue;
      const d = Math.hypot(position.x - c.x, position.y - c.y);
      if (!best || d < best.d) best = { clusterId: c.clusterId, d };
    }
    if (best) return best.clusterId;
  }

  let best: { clusterId: string; d: number } | null = null;
  for (const hub of hubs) {
    if (hub.clusterId === fromClusterId) continue;
    const d = Math.hypot(position.x - hub.x, position.y - hub.y);
    if (d <= hub.radius && (!best || d < best.d)) best = { clusterId: hub.clusterId, d };
  }
  return best?.clusterId ?? null;
}
