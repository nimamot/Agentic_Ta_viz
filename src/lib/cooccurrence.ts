/**
 * Parse and transform cooccurrence JSON (Supabase JSONB) for vis-network.
 * Shape matches pipeline cooccurrence.py output.
 */

export type CooccurrenceLayer = "meta" | "theme";

export interface CooccurrenceCoverageEntry {
  count: number;
  pct: number;
}

export interface CooccurrencePairRow {
  pair: [string, string];
  count: number;
  pct_reviews: number;
}

export interface CooccurrencePayload {
  top_meta_theme_pairs: CooccurrencePairRow[];
  top_theme_pairs: CooccurrencePairRow[];
  review_coverage: {
    meta_themes: Record<string, CooccurrenceCoverageEntry>;
    themes: Record<string, CooccurrenceCoverageEntry>;
  };
  total_reviews: number;
}

export type CooccurrenceVisNode = {
  id: string;
  label: string;
  title: string;
  value: number;
};

export type CooccurrenceVisEdge = {
  id: string;
  from: string;
  to: string;
  title: string;
  width: number;
};

function unwrapJsonField(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function isCoverageEntry(v: unknown): v is CooccurrenceCoverageEntry {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.count === "number" && typeof o.pct === "number";
}

function isPairRow(v: unknown): v is CooccurrencePairRow {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const p = o.pair;
  if (!Array.isArray(p) || p.length !== 2) return false;
  if (typeof p[0] !== "string" || typeof p[1] !== "string") return false;
  return typeof o.count === "number" && typeof o.pct_reviews === "number";
}

function parseCoverageMap(raw: unknown): Record<string, CooccurrenceCoverageEntry> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, CooccurrenceCoverageEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isCoverageEntry(v)) out[k] = v;
  }
  return out;
}

function parsePairs(raw: unknown): CooccurrencePairRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPairRow);
}

export type ParseCooccurrenceResult =
  | { ok: true; data: CooccurrencePayload }
  | { ok: false; error: string };

export function parseCooccurrencePayload(raw: unknown): ParseCooccurrenceResult {
  const u = unwrapJsonField(raw);
  if (u == null) {
    return { ok: false, error: "Co-occurrence data is missing." };
  }
  if (typeof u !== "object" || Array.isArray(u)) {
    return { ok: false, error: "Co-occurrence data is not an object." };
  }
  const o = u as Record<string, unknown>;
  const topMeta = parsePairs(o.top_meta_theme_pairs);
  const topTheme = parsePairs(o.top_theme_pairs);
  const rc = o.review_coverage;
  let meta_themes: Record<string, CooccurrenceCoverageEntry> = {};
  let themes: Record<string, CooccurrenceCoverageEntry> = {};
  if (rc != null && typeof rc === "object" && !Array.isArray(rc)) {
    const r = rc as Record<string, unknown>;
    meta_themes = parseCoverageMap(r.meta_themes);
    themes = parseCoverageMap(r.themes);
  }
  const total_reviews = typeof o.total_reviews === "number" && Number.isFinite(o.total_reviews) ? o.total_reviews : 0;

  if (topMeta.length === 0 && topTheme.length === 0) {
    return { ok: false, error: "Co-occurrence lists are empty." };
  }

  return {
    ok: true,
    data: {
      top_meta_theme_pairs: topMeta,
      top_theme_pairs: topTheme,
      review_coverage: { meta_themes, themes },
      total_reviews,
    },
  };
}

export interface BuildCooccurrenceVisOptions {
  maxEdges: number;
  minCount: number;
}

const LABEL_MAX = 36;

function truncateLabel(s: string): string {
  const t = s.trim();
  if (t.length <= LABEL_MAX) return t;
  return `${t.slice(0, LABEL_MAX - 1)}…`;
}

function edgeKey(a: string, b: string): string {
  return a <= b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function buildCooccurrenceVisInput(
  data: CooccurrencePayload,
  layer: CooccurrenceLayer,
  options: BuildCooccurrenceVisOptions
): {
  nodes: CooccurrenceVisNode[];
  edges: CooccurrenceVisEdge[];
  totalReviews: number;
} {
  const pairsSource =
    layer === "meta" ? data.top_meta_theme_pairs : data.top_theme_pairs;
  const coverageMap =
    layer === "meta" ? data.review_coverage.meta_themes : data.review_coverage.themes;

  const filtered = pairsSource.filter((p) => p.count >= options.minCount).slice(0, options.maxEdges);

  const nodeLabels = new Set<string>();
  for (const p of filtered) {
    nodeLabels.add(p.pair[0]);
    nodeLabels.add(p.pair[1]);
  }

  let maxCov = 1;
  for (const label of nodeLabels) {
    const c = coverageMap[label]?.count ?? 1;
    if (c > maxCov) maxCov = c;
  }

  const nodes: CooccurrenceVisNode[] = Array.from(nodeLabels).map((id) => {
    const cov = coverageMap[id];
    const count = cov?.count ?? 0;
    const pct = cov?.pct ?? 0;
    const value = maxCov > 0 ? Math.max(1, (count / maxCov) * 24 + 4) : 8;
    const pctStr = (pct * 100).toFixed(2);
    const title =
      count > 0
        ? `${id}\nAppears in ${count.toLocaleString()} reviews (${pctStr}% of corpus)`
        : `${id}\nNo coverage entry`;
    return {
      id,
      label: truncateLabel(id),
      title,
      value,
    };
  });

  let maxCount = 1;
  for (const p of filtered) {
    if (p.count > maxCount) maxCount = p.count;
  }

  const seenKeys = new Set<string>();
  const edges: CooccurrenceVisEdge[] = [];
  for (const p of filtered) {
    const [a, b] = p.pair;
    if (a === b) continue;
    const ek = edgeKey(a, b);
    if (seenKeys.has(ek)) continue;
    seenKeys.add(ek);
    const pctStr = (p.pct_reviews * 100).toFixed(2);
    const title = `Co-occur in ${p.count.toLocaleString()} reviews (${pctStr}% of corpus)`;
    const width = 1 + (p.count / maxCount) * 8;
    edges.push({
      id: ek,
      from: a,
      to: b,
      title,
      width,
    });
  }

  return {
    nodes,
    edges,
    totalReviews: data.total_reviews,
  };
}
