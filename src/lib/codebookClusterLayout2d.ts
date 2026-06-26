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
  shortLabel: string;
  title: string;
  opacity: number;
  highlighted: boolean;
  dimmed: boolean;
  hidden: boolean;
}

export interface Codebook2DIsland {
  clusterId: string;
  label: string;
  color: string;
  x: number;
  y: number;
  confidence: number;
  codeCount: number;
  boundaryPath: string;
  contourPaths: string[];
  fullLabel: string;
  labelBoxX: number;
  labelBoxY: number;
  labelBoxW: number;
  labelBoxH: number;
  labelConnectX: number;
  labelConnectY: number;
  labelLineX: number;
  labelLineY: number;
  labelPlacement: "top" | "right" | "bottom" | "left";
  codes: Codebook2DCodeNode[];
  width: number;
  height: number;
  radius: number;
  overviewOnly: boolean;
  dimmed: boolean;
  dropTarget: boolean;
}

export interface Codebook2DLayout {
  islands: Codebook2DIsland[];
  hubs: Codebook2DHub[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  dropThreshold: number;
  bridgePaths: Codebook2DBridge[];
}

export interface Codebook2DBridge {
  id: string;
  d: string;
  color: string;
}

const CODE_PILL_W = 34;
const CODE_PILL_H = 26;
const CODE_GAP = 16;
const ISLAND_PAD = 56;
const LABEL_CARD_W = 280;
const LABEL_CARD_H = 68;
const LABEL_CLEARANCE = 64;

function truncate(text: string, max = 28): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function codeIndexLabel(index: number, total: number): string {
  const width = total >= 100 ? 3 : total >= 10 ? 2 : 1;
  return String(index + 1).padStart(width, "0");
}

export { codeIndexLabel };

function codeNodeId(clusterId: string, code: string): string {
  return `code:${clusterId}:${code}`;
}

function hexGridPack(count: number, pillW: number, pillH: number, gap: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const dx = pillW + gap;
  const dy = pillH + gap;
  // Fewer columns → wider islands with more air between pills
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 0.62)));
  const rows = Math.ceil(count / cols);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const offsetX = r % 2 === 1 ? dx * 0.5 : 0;
    const x = (c - (cols - 1) / 2) * dx + offsetX;
    const y = (r - (rows - 1) / 2) * dy;
    out.push({ x, y });
  }
  return out;
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function pathFromExpandedPoints(expanded: { x: number; y: number }[]): string {
  if (expanded.length < 3) return "";
  const n = expanded.length;
  let d = `M ${expanded[0].x.toFixed(1)} ${expanded[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const curr = expanded[i];
    const next = expanded[(i + 1) % n];
    const mx = (curr.x + next.x) / 2;
    const my = (curr.y + next.y) / 2;
    d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += " Z";
  return d;
}

function organicBlobPath(
  points: { x: number; y: number }[],
  cx: number,
  cy: number,
  padding: number,
  wobbleSeed: number
): { boundaryPath: string; contourPaths: string[] } {
  if (points.length === 0) {
    const r = padding + 28;
    const boundaryPath = `M ${cx - r} ${cy} C ${cx - r} ${cy - r * 0.6}, ${cx - r * 0.4} ${cy - r}, ${cx} ${cy - r}
      C ${cx + r * 0.4} ${cy - r}, ${cx + r} ${cy - r * 0.6}, ${cx + r} ${cy}
      C ${cx + r} ${cy + r * 0.55}, ${cx + r * 0.35} ${cy + r}, ${cx} ${cy + r}
      C ${cx - r * 0.35} ${cy + r}, ${cx - r} ${cy + r * 0.55}, ${cx - r} ${cy} Z`;
    return {
      boundaryPath,
      contourPaths: [0.78, 0.9].map((s) => {
        const sr = r * s;
        return `M ${cx - sr} ${cy} A ${sr} ${sr * 0.85} 0 1 1 ${cx + sr} ${cy} A ${sr} ${sr * 0.85} 0 1 1 ${cx - sr} ${cy} Z`;
      }),
    };
  }

  const hull = convexHull(points);
  const expanded = hull.map((p, i) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const wobble = 1 + Math.sin(wobbleSeed * 3.7 + i * 1.9) * 0.08 + Math.cos(wobbleSeed * 2.1 + i * 2.7) * 0.06;
    const scale = (dist + padding) / dist;
    return { x: cx + dx * scale * wobble, y: cy + dy * scale * wobble };
  });

  if (expanded.length < 3) {
    const r = padding + 20;
    const boundaryPath = `M ${cx - r} ${cy} A ${r} ${r * 0.85} 0 1 1 ${cx + r} ${cy} A ${r} ${r * 0.85} 0 1 1 ${cx - r} ${cy} Z`;
    return {
      boundaryPath,
      contourPaths: [0.78, 0.9].map((s) => {
        const sr = r * s;
        return `M ${cx - sr} ${cy} A ${sr} ${sr * 0.85} 0 1 1 ${cx + sr} ${cy} A ${sr} ${sr * 0.85} 0 1 1 ${cx - sr} ${cy} Z`;
      }),
    };
  }

  const boundaryPath = pathFromExpandedPoints(expanded);
  const contourPaths = [0.74, 0.88].map((s) =>
    pathFromExpandedPoints(expanded.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s })))
  );
  return { boundaryPath, contourPaths };
}

function islandSize(codeCount: number, overviewOnly: boolean): { width: number; height: number } {
  if (overviewOnly) {
    const r = 56 + Math.sqrt(codeCount) * 14;
    return { width: r * 2.4, height: r * 2 };
  }
  const positions = hexGridPack(codeCount, CODE_PILL_W, CODE_PILL_H, CODE_GAP);
  if (!positions.length) return { width: 80, height: 60 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.x - CODE_PILL_W / 2);
    maxX = Math.max(maxX, p.x + CODE_PILL_W / 2);
    minY = Math.min(minY, p.y - CODE_PILL_H / 2);
    maxY = Math.max(maxY, p.y + CODE_PILL_H / 2);
  }
  return {
    width: maxX - minX + ISLAND_PAD * 2,
    height: maxY - minY + ISLAND_PAD * 2,
  };
}

function placeIslands(sizes: { width: number; height: number }[]): { x: number; y: number }[] {
  const n = sizes.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  const positions = sizes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2 + i * 0.22;
    const radius = 120 + n * 20;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 };
  });

  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = positions[i];
        const b = positions[j];
        const minDistX = (sizes[i].width + sizes[j].width) / 2 + 56;
        const minDistY = (sizes[i].height + sizes[j].height) / 2 + 44;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minDistX - Math.abs(dx);
        const overlapY = minDistY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const push = overlapX < overlapY ? overlapX : overlapY;
          const mag = Math.hypot(dx, dy) || 1;
          const ux = dx / mag;
          const uy = dy / mag;
          a.x -= ux * push * 0.5;
          a.y -= uy * push * 0.5;
          b.x += ux * push * 0.5;
          b.y += uy * push * 0.5;
        }
      }
    }
  }
  return positions;
}

function buildBridgePaths(
  islands: Pick<Codebook2DIsland, "clusterId" | "x" | "y" | "color">[]
): Codebook2DBridge[] {
  const bridges: Codebook2DBridge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < islands.length; i++) {
    const a = islands[i];
    const neighbors = islands
      .map((b, j) => ({ j, d: Math.hypot(b.x - a.x, b.y - a.y) }))
      .filter((n) => n.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);

    for (const { j } of neighbors) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = islands[j];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.min(36, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
      bridges.push({
        id: `bridge-${a.clusterId}-${b.clusterId}`,
        d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        color: a.color,
      });
    }
  }
  return bridges;
}

function buildIsland(
  clusterId: string,
  entry: ClusterEntry | undefined,
  color: string,
  codes: string[],
  center: { x: number; y: number },
  index: number,
  options: {
    overviewOnly: boolean;
    highlighted: HighlightedCode | null;
    hasCodeFocus: boolean;
    highlightCluster: string | null;
    draggingCodeKey: string | null;
    dropTarget: boolean;
    totalCodeCount: number;
  }
): Codebook2DIsland {
  const { overviewOnly, highlighted, hasCodeFocus, highlightCluster, draggingCodeKey, dropTarget, totalCodeCount } =
    options;
  const label = entry?.label || `Cluster ${clusterId}`;
  const overview = overviewOnly || codes.length === 0;
  const dimmed = !overview && hasCodeFocus && highlightCluster !== clusterId;

  const localPositions = overview
    ? []
    : hexGridPack(codes.length, CODE_PILL_W, CODE_PILL_H, CODE_GAP);

  const codeNodes: Codebook2DCodeNode[] = codes.map((code, i) => {
    const pos = localPositions[i] ?? { x: 0, y: 0 };
    const nodeKey = `${clusterId}:${code}`;
    const isHighlighted = highlighted?.code === code && highlighted.clusterId === clusterId;
    return {
      id: codeNodeId(clusterId, code),
      code,
      clusterId,
      x: center.x + pos.x,
      y: center.y + pos.y,
      shortLabel: codeIndexLabel(i, codes.length),
      title: code,
      opacity: draggingCodeKey === nodeKey ? 0.25 : isHighlighted ? 1 : dimmed ? 0.5 : 1,
      highlighted: isHighlighted,
      dimmed,
      hidden: draggingCodeKey === nodeKey,
    };
  });

  const hullPoints = overview
    ? []
    : localPositions.map((p) => ({ x: center.x + p.x, y: center.y + p.y }));

  const padding = overview ? 14 : ISLAND_PAD * 0.8;
  const { boundaryPath, contourPaths } = organicBlobPath(hullPoints, center.x, center.y, padding, index + 1.3);

  let minX = center.x,
    maxX = center.x,
    minY = center.y,
    maxY = center.y;
  const boundaryNums = boundaryPath.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  for (let i = 0; i < boundaryNums.length; i += 2) {
    minX = Math.min(minX, boundaryNums[i]);
    maxX = Math.max(maxX, boundaryNums[i]);
    minY = Math.min(minY, boundaryNums[i + 1]);
    maxY = Math.max(maxY, boundaryNums[i + 1]);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const radius = Math.max(width, height) * 0.52;

  const fullLabel = label.trim() || `Cluster ${clusterId}`;
  const placements = ["top", "right", "bottom", "left"] as const;
  const labelPlacement = placements[index % placements.length];
  let labelBoxX = 0;
  let labelBoxY = 0;
  let labelConnectX = center.x;
  let labelConnectY = center.y;
  let labelLineX = center.x;
  let labelLineY = center.y;

  switch (labelPlacement) {
    case "top":
      labelBoxX = center.x - LABEL_CARD_W / 2;
      labelBoxY = minY - LABEL_CLEARANCE - LABEL_CARD_H;
      labelConnectX = center.x;
      labelConnectY = minY;
      labelLineX = center.x;
      labelLineY = labelBoxY + LABEL_CARD_H;
      break;
    case "bottom":
      labelBoxX = center.x - LABEL_CARD_W / 2;
      labelBoxY = maxY + LABEL_CLEARANCE;
      labelConnectX = center.x;
      labelConnectY = maxY;
      labelLineX = center.x;
      labelLineY = labelBoxY;
      break;
    case "left":
      labelBoxX = minX - LABEL_CLEARANCE - LABEL_CARD_W;
      labelBoxY = center.y - LABEL_CARD_H / 2;
      labelConnectX = minX;
      labelConnectY = center.y;
      labelLineX = labelBoxX + LABEL_CARD_W;
      labelLineY = center.y;
      break;
    case "right":
      labelBoxX = maxX + LABEL_CLEARANCE;
      labelBoxY = center.y - LABEL_CARD_H / 2;
      labelConnectX = maxX;
      labelConnectY = center.y;
      labelLineX = labelBoxX;
      labelLineY = center.y;
      break;
  }

  return {
    clusterId,
    label: truncate(fullLabel, 42),
    fullLabel,
    color,
    x: center.x,
    y: center.y,
    confidence: entry?.confidence ?? 0,
    codeCount: totalCodeCount,
    boundaryPath,
    contourPaths,
    labelBoxX,
    labelBoxY,
    labelBoxW: LABEL_CARD_W,
    labelBoxH: LABEL_CARD_H,
    labelConnectX,
    labelConnectY,
    labelLineX,
    labelLineY,
    labelPlacement,
    codes: codeNodes.filter((c) => !c.hidden),
    width,
    height,
    radius,
    overviewOnly: overview,
    dimmed,
    dropTarget,
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

  const visibleClusters = sortedClusterIds.filter((cid) => {
    if (overviewMode) return true;
    return forceShowAllCodes || expandedClusterIds.has(cid);
  });

  const codesByCluster = new Map<string, string[]>();
  for (const cid of visibleClusters) {
    const codes =
      overviewMode ? [] : forceShowAllCodes || expandedClusterIds.has(cid) ? clusterToCodes[cid] ?? [] : [];
    codesByCluster.set(cid, codes);
  }

  const sizes = visibleClusters.map((cid) => {
    const codes = codesByCluster.get(cid) ?? [];
    const overview = overviewMode || codes.length === 0;
    const count = overview ? clusterToCodes[cid]?.length ?? 0 : codes.length;
    return islandSize(count, overview);
  });

  const centers = placeIslands(sizes);
  const islands: Codebook2DIsland[] = [];
  const hubs: Codebook2DHub[] = [];

  visibleClusters.forEach((cid, index) => {
    const entry = clusters[cid];
    const color = clusterColor.get(cid) ?? "#7cf0d0";
    const codes = codesByCluster.get(cid) ?? [];
    const center = centers[index] ?? { x: 0, y: 0 };
    const island = buildIsland(cid, entry, color, codes, center, index, {
      overviewOnly: overviewMode || codes.length === 0,
      highlighted,
      hasCodeFocus,
      highlightCluster,
      draggingCodeKey: draggingCodeKey ?? null,
      dropTarget: dropTargetClusterId === cid,
      totalCodeCount: clusterToCodes[cid]?.length ?? 0,
    });
    islands.push(island);
    hubs.push({
      clusterId: cid,
      label: island.label,
      x: center.x,
      y: center.y,
      color,
      confidence: island.confidence,
      codeCount: island.codeCount,
      radius: island.radius,
    });
  });

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const island of islands) {
    minX = Math.min(minX, island.x - island.width / 2 - 40);
    maxX = Math.max(maxX, island.x + island.width / 2 + 40);
    minY = Math.min(minY, island.y - island.height / 2 - 40);
    maxY = Math.max(maxY, island.y + island.height / 2 + 40);
    minX = Math.min(minX, island.labelBoxX);
    maxX = Math.max(maxX, island.labelBoxX + island.labelBoxW);
    minY = Math.min(minY, island.labelBoxY);
    maxY = Math.max(maxY, island.labelBoxY + island.labelBoxH);
  }

  if (!isFinite(minX)) {
    minX = -200;
    maxX = 200;
    minY = -200;
    maxY = 200;
  }

  const maxRadius = Math.max(0, ...hubs.map((h) => h.radius));
  const dropThreshold = Math.max(48, maxRadius * 1.1);

  return {
    islands,
    hubs,
    bounds: { minX, minY, maxX, maxY },
    dropThreshold,
    bridgePaths: buildBridgePaths(islands),
  };
}

export function nearestDropClusterId(
  position: { x: number; y: number },
  hubs: Codebook2DHub[],
  fromClusterId: string,
  threshold: number
): string | null {
  let best: { clusterId: string; d: number } | null = null;
  for (const hub of hubs) {
    if (hub.clusterId === fromClusterId) continue;
    const d = Math.hypot(position.x - hub.x, position.y - hub.y);
    const limit = Math.max(threshold, hub.radius * 0.85);
    if (d <= limit && (!best || d < best.d)) best = { clusterId: hub.clusterId, d };
  }
  return best?.clusterId ?? null;
}
