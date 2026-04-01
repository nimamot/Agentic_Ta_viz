import type { GraphData } from "../types";

export type FlowerLayoutOptions = {
  /** Distance from parent to each child ring. */
  radiusStep?: number;
  /** Radius for multiple top-level roots arranged in a circle. */
  rootRingRadius?: number;
  /** Slightly wider spacing when the graph is only disconnected roots (theme strip). */
  themeStripBoost?: boolean;
};

/**
 * Directed tree → 2D positions: roots on a circle (or one root at center),
 * children in arcs around their parent so branches “open” like a flower.
 */
export function computeFlowerPositions(
  data: GraphData,
  options?: FlowerLayoutOptions
): Map<number, { x: number; y: number }> {
  const rStepBase = options?.radiusStep ?? 220;
  const themeBoost = options?.themeStripBoost ?? false;
  const rStep = themeBoost ? rStepBase * 1.12 : rStepBase;

  const childrenMap = new Map<number, number[]>();
  const parentMap = new Map<number, number>();
  for (const e of data.edges) {
    const arr = childrenMap.get(e.from);
    if (arr) arr.push(e.to);
    else childrenMap.set(e.from, [e.to]);
    parentMap.set(e.to, e.from);
  }
  for (const arr of childrenMap.values()) arr.sort((a, b) => a - b);

  const roots = data.nodes
    .filter((n) => !parentMap.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => a - b);

  const pos = new Map<number, { x: number; y: number }>();
  const rootR =
    options?.rootRingRadius ?? Math.max(200, 110 + roots.length * 58);

  if (roots.length === 1) {
    pos.set(roots[0], { x: 0, y: 0 });
  } else {
    roots.forEach((id, i) => {
      const theta = (2 * Math.PI * i) / roots.length - Math.PI / 2;
      pos.set(id, { x: rootR * Math.cos(theta), y: rootR * Math.sin(theta) });
    });
  }

  function placeChildren(parentId: number): void {
    const kids = childrenMap.get(parentId);
    if (!kids?.length) return;
    const p = pos.get(parentId);
    if (!p) return;

    const n = kids.length;
    const distFromOrigin = Math.hypot(p.x, p.y);
    const outward =
      distFromOrigin < 1e-4 ? -Math.PI / 2 : Math.atan2(p.y, p.x);

    const arc = Math.min(Math.PI * 1.4, Math.PI * 0.36 + (n - 1) * 0.46);
    const len =
      rStep * (1.08 - Math.min(0.24, (n - 1) * 0.035)) * (themeBoost ? 0.96 : 1);

    kids.forEach((cid, j) => {
      const theta =
        n === 1 ? outward : outward - arc / 2 + (j * arc) / Math.max(1, n - 1);
      pos.set(cid, {
        x: p.x + len * Math.cos(theta),
        y: p.y + len * Math.sin(theta),
      });
    });

    for (const cid of kids) placeChildren(cid);
  }

  for (const r of roots) placeChildren(r);

  for (const node of data.nodes) {
    if (!pos.has(node.id)) {
      const t = (node.id % 13) * 0.51;
      pos.set(node.id, { x: 420 * Math.cos(t), y: 420 * Math.sin(t) });
    }
  }

  return pos;
}
