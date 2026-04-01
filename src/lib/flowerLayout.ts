import type { GraphData } from "../types";

export type FlowerLayoutOptions = {
  radiusStep?: number;
  rootRingRadius?: number;
  themeStripBoost?: boolean;
};

/**
 * Concentric “flower” layout: one polar angle per subtree wedge, one radius per depth.
 * All coordinates are from the global origin (not parent-relative), so fully expanded trees
 * stay readable: large branches get wide wedges, crowded depth layers get a larger ring.
 */
export function computeFlowerPositions(
  data: GraphData,
  options?: FlowerLayoutOptions
): Map<number, { x: number; y: number }> {
  const themeBoost = options?.themeStripBoost ?? false;

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

  if (roots.length === 0) {
    data.nodes.forEach((n, i) => {
      const t = (2 * Math.PI * i) / Math.max(1, data.nodes.length);
      pos.set(n.id, { x: 320 * Math.cos(t), y: 320 * Math.sin(t) });
    });
    return pos;
  }

  // --- BFS depth from roots ---
  const depth = new Map<number, number>();
  const queue = [...roots];
  for (const r of roots) depth.set(r, 0);
  while (queue.length) {
    const u = queue.shift()!;
    const du = depth.get(u)!;
    for (const c of childrenMap.get(u) ?? []) {
      if (!depth.has(c)) {
        depth.set(c, du + 1);
        queue.push(c);
      }
    }
  }

  const maxAtDepth = new Map<number, number>();
  for (const n of data.nodes) {
    const d = depth.get(n.id);
    if (d === undefined) continue;
    maxAtDepth.set(d, (maxAtDepth.get(d) ?? 0) + 1);
  }

  // --- subtree node count (includes self) ---
  const subCount = new Map<number, number>();
  function countSub(id: number): number {
    const kids = childrenMap.get(id) ?? [];
    const v = 1 + kids.reduce((s, c) => s + countSub(c), 0);
    subCount.set(id, v);
    return v;
  }
  for (const r of roots) countSub(r);

  // --- angular wedge [ang0, ang1] for each node’s subtree ---
  const ang0 = new Map<number, number>();
  const ang1 = new Map<number, number>();

  function assignWedges(nodeId: number, a0: number, a1: number): void {
    ang0.set(nodeId, a0);
    ang1.set(nodeId, a1);
    const kids = childrenMap.get(nodeId);
    if (!kids?.length) return;

    const span = a1 - a0;
    const n = kids.length;
    if (span <= 1e-6) return;

    const weights = kids.map((c) => Math.max(1, subCount.get(c) ?? 1));
    const sumW = weights.reduce((x, y) => x + y, 0);

    // Target minimum arc per child (do not cap with span/n — that forces tiny wedges for large fan-out).
    // After proportional mix, we normalize to span so geometry stays consistent; larger radii + tangential
    // relax then recover readable spacing for leaves.
    const minSlice = Math.max(
      0.34,
      Math.min(1.02, 11 / Math.sqrt(Math.max(1, n)))
    );

    let slices = kids.map((_, i) => Math.max(minSlice, (span * weights[i]) / sumW));
    let total = slices.reduce((x, y) => x + y, 0);
    if (total > span) {
      slices = slices.map((s) => (s * span) / total);
    } else {
      const slack = span - total;
      slices = slices.map((s) => s + slack / n);
    }

    let t = a0;
    for (let i = 0; i < n; i++) {
      const end = t + slices[i];
      assignWedges(kids[i], t, end);
      t = end;
    }
  }

  const twoPi = 2 * Math.PI;
  const rootR0 =
    options?.rootRingRadius ?? Math.max(300, 175 + roots.length * 75);

  if (roots.length === 1) {
    assignWedges(roots[0], -Math.PI / 2, -Math.PI / 2 + twoPi);
  } else {
    const gap = Math.min(0.06, 0.45 / roots.length) * (twoPi / roots.length);
    const usable = twoPi - gap * roots.length;
    const sector = usable / roots.length;
    let cursor = -Math.PI / 2;
    for (const rid of roots) {
      assignWedges(rid, cursor, cursor + sector);
      cursor += sector + gap;
    }
  }

  // --- radius per depth: more nodes on a layer → larger ring step + crowding stretch (wider arcs in px) ---
  function radiusForDepth(d: number): number {
    if (d === 0 && roots.length === 1) return 0;
    if (d === 0) return rootR0 * (themeBoost ? 1.08 : 1);
    const cnt = maxAtDepth.get(d) ?? 1;
    const stepBase = options?.radiusStep ?? 198;
    const step =
      stepBase + 72 * Math.log2(2 + cnt) + 22 * Math.log2(2 + d);
    const inner = roots.length === 1 ? 0 : rootR0;
    const crowding = 1 + 0.24 * Math.log2(1 + cnt / 16);
    return (inner + step * d) * crowding * (themeBoost && d <= 2 ? 1.12 : 1);
  }

  for (const n of data.nodes) {
    const id = n.id;
    const d = depth.get(id);
    if (d === undefined) {
      const t = (id % 17) * 0.41;
      pos.set(id, { x: 520 * Math.cos(t), y: 520 * Math.sin(t) });
      continue;
    }
    const a0 = ang0.get(id);
    const a1 = ang1.get(id);
    if (a0 === undefined || a1 === undefined) continue;
    const mid = (a0 + a1) / 2;
    const r = radiusForDepth(d);
    if (r < 1e-6) {
      pos.set(id, { x: 0, y: 0 });
    } else {
      pos.set(id, { x: r * Math.cos(mid), y: r * Math.sin(mid) });
    }
  }

  const minSep = 128;
  const byDepth = new Map<number, number[]>();
  for (const n of data.nodes) {
    const d = depth.get(n.id);
    if (d === undefined) continue;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  }

  // Same-depth repulsion (can nudge radius slightly)
  for (let it = 0; it < 18; it++) {
    let moved = false;
    for (const ids of byDepth.values()) {
      if (ids.length < 2) continue;
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const pa = pos.get(ids[a]);
          const pb = pos.get(ids[b]);
          if (!pa || !pb) continue;
          let dx = pb.x - pa.x;
          let dy = pb.y - pa.y;
          let dist = Math.hypot(dx, dy);
          if (dist < 1e-6) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          if (dist >= minSep) continue;
          moved = true;
          const push = (minSep - dist) / 2 + 0.65;
          const nx = dx / dist;
          const ny = dy / dist;
          pa.x -= push * nx;
          pa.y -= push * ny;
          pb.x += push * nx;
          pb.y += push * ny;
        }
      }
    }
    if (!moved) break;
  }

  // Tangential-only pass: fixed radius per node, spread angles so leaf bands open up (labels / small nodes).
  const fixedR = new Map<number, number>();
  const polar = new Map<number, { th: number }>();
  for (const n of data.nodes) {
    const id = n.id;
    const p = pos.get(id);
    if (!p) continue;
    const d = depth.get(id);
    if (d === undefined) continue;
    const r = Math.hypot(p.x, p.y);
    fixedR.set(id, r < 1e-6 ? 0 : r);
    polar.set(id, { th: Math.atan2(p.y, p.x) });
  }

  for (let it = 0; it < 14; it++) {
    let moved = false;
    for (const ids of byDepth.values()) {
      if (ids.length < 2) continue;
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const ida = ids[a];
          const idb = ids[b];
          const ra = fixedR.get(ida) ?? 0;
          const rb = fixedR.get(idb) ?? 0;
          if (ra < 1e-3 || rb < 1e-3) continue;
          const ta = polar.get(ida)!;
          const tb = polar.get(idb)!;
          const xa = ra * Math.cos(ta.th);
          const ya = ra * Math.sin(ta.th);
          const xb = rb * Math.cos(tb.th);
          const yb = rb * Math.sin(tb.th);
          const dist = Math.hypot(xb - xa, yb - ya);
          if (dist >= minSep) continue;
          moved = true;
          const ravg = (ra + rb) / 2;
          let dth = ((minSep - dist) / ravg) * 0.52;
          dth = Math.min(dth, 0.14);
          const cross = xa * yb - xb * ya;
          const sign = cross >= 0 ? 1 : -1;
          ta.th -= sign * dth;
          tb.th += sign * dth;
        }
      }
    }
    if (!moved) break;
  }

  for (const n of data.nodes) {
    const id = n.id;
    const r = fixedR.get(id);
    const th = polar.get(id)?.th;
    if (r === undefined || th === undefined) continue;
    if (r < 1e-6) {
      pos.set(id, { x: 0, y: 0 });
    } else {
      pos.set(id, { x: r * Math.cos(th), y: r * Math.sin(th) });
    }
  }

  return pos;
}
