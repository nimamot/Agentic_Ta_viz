import { parseCodeEvidence, type CodeEvidenceEntry } from "./codeEvidence";

export type ClusterSource = "llm" | "llm+edited" | "human";
export type ClusterStatus = "keep" | "drop";

export interface ClusterEntry {
  label: string;
  description: string;
  confidence: number;
  source: ClusterSource;
  needs_more_evidence: boolean;
  status: ClusterStatus;
}

export type CodebookOperation =
  | { type: "drop"; cluster_id: string; code_disposition: "delete" | "orphan" }
  | {
      type: "merge";
      from_cluster_ids: string[];
      target_cluster_id: string;
      label: string;
    }
  | {
      type: "split";
      from_cluster_id: string;
      splits: { new_cluster_id: string; label: string; code_ids: string[] }[];
    };

export interface CodebookPayload {
  version: number;
  clusters: Record<string, ClusterEntry>;
  operations: CodebookOperation[];
  cluster_to_codes: Record<string, string[]>;
}

export interface CodebookConfidenceEntry {
  label?: string;
  confidence?: number;
  rationale?: string;
  candidate_labels?: string[];
}

export interface ClusteredCodesPayload {
  cluster_to_codes?: Record<string, string[]>;
  all_codes?: string[];
}

export interface CodebookReviewRow {
  id: string;
  slug: string;
  research_question: string | null;
  status: string;
  codebook_v1: unknown;
  clustered_codes: unknown;
  codebook_confidence: unknown;
  code_evidence?: unknown;
  created_at: string;
  updated_at?: string | null;
}

export interface WorkingCodebookState {
  review: CodebookReviewRow;
  codebook: CodebookPayload;
  confidence: Record<string, CodebookConfidenceEntry>;
  codeEvidence: Record<string, CodeEvidenceEntry>;
  /** How many duplicate code assignments were dropped when loading (kept lowest-confidence cluster). */
  dedupedCodeCount?: number;
}

function unwrapJsonField<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseClusterEntry(raw: unknown, fallbackLabel = ""): ClusterEntry {
  const o = asRecord(raw);
  const source = o?.source;
  const status = o?.status;
  return {
    label: typeof o?.label === "string" ? o.label : fallbackLabel,
    description: typeof o?.description === "string" ? o.description : "",
    confidence: typeof o?.confidence === "number" ? o.confidence : 0,
    source: source === "llm+edited" || source === "human" ? source : "llm",
    needs_more_evidence: Boolean(o?.needs_more_evidence),
    status: status === "drop" ? "drop" : "keep",
  };
}

export function parseCodebookReviewRow(row: Record<string, unknown>): CodebookReviewRow {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    research_question: typeof row.research_question === "string" ? row.research_question : null,
    status: String(row.status ?? ""),
    codebook_v1: unwrapJsonField(row.codebook_v1) ?? row.codebook_v1,
    clustered_codes: unwrapJsonField(row.clustered_codes) ?? row.clustered_codes,
    codebook_confidence: unwrapJsonField(row.codebook_confidence) ?? row.codebook_confidence,
    code_evidence: unwrapJsonField(row.code_evidence) ?? row.code_evidence,
    created_at: String(row.created_at ?? ""),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function clusterSortKey(
  clusters: Record<string, ClusterEntry>,
  a: string,
  b: string
): number {
  const ca = clusters[a]?.confidence ?? 0;
  const cb = clusters[b]?.confidence ?? 0;
  return ca - cb || a.localeCompare(b);
}

/**
 * Ensure each code appears in at most one cluster. When the pipeline assigns a code
 * to multiple clusters, keep it in the lowest-confidence cluster (needs review first).
 */
export function dedupeClusterToCodes(
  cluster_to_codes: Record<string, string[]>,
  clusters: Record<string, ClusterEntry>
): { cluster_to_codes: Record<string, string[]>; dedupedCodeCount: number } {
  const order = Object.keys(cluster_to_codes).sort((a, b) => clusterSortKey(clusters, a, b));
  const seen = new Set<string>();
  const out: Record<string, string[]> = {};
  let dedupedCodeCount = 0;

  for (const cid of order) {
    const kept: string[] = [];
    for (const code of cluster_to_codes[cid] ?? []) {
      if (seen.has(code)) {
        dedupedCodeCount += 1;
        continue;
      }
      seen.add(code);
      kept.push(code);
    }
    out[cid] = kept;
  }

  return { cluster_to_codes: out, dedupedCodeCount };
}

export function buildWorkingCodebook(review: CodebookReviewRow): WorkingCodebookState {
  const v1 = asRecord(review.codebook_v1);
  const clustered = unwrapJsonField<ClusteredCodesPayload>(review.clustered_codes) ?? {};
  const confidence =
    unwrapJsonField<Record<string, CodebookConfidenceEntry>>(review.codebook_confidence) ?? {};

  const v1Clusters = asRecord(v1?.clusters) ?? {};
  const v1ClusterToCodes = asRecord(v1?.cluster_to_codes) ?? {};
  const clusteredMap = clustered.cluster_to_codes ?? {};

  const clusterIds = new Set<string>([
    ...Object.keys(v1Clusters),
    ...Object.keys(v1ClusterToCodes),
    ...Object.keys(clusteredMap),
    ...Object.keys(confidence),
  ]);

  const clusters: Record<string, ClusterEntry> = {};
  const cluster_to_codes: Record<string, string[]> = {};

  for (const cid of clusterIds) {
    const conf = confidence[cid];
    const fromV1 = v1Clusters[cid];
    const entry = parseClusterEntry(fromV1, conf?.label ?? "");
    if (!entry.description && conf?.rationale) entry.description = conf.rationale;
    if (entry.confidence === 0 && typeof conf?.confidence === "number") {
      entry.confidence = conf.confidence;
    }
    if (!entry.label && conf?.label) entry.label = conf.label;
    clusters[cid] = entry;

    const codesRaw = clusteredMap[cid] ?? v1ClusterToCodes[cid];
    cluster_to_codes[cid] = Array.isArray(codesRaw)
      ? codesRaw.filter((c): c is string => typeof c === "string")
      : [];
  }

  const operationsRaw = v1?.operations;
  const operations = Array.isArray(operationsRaw)
    ? (operationsRaw as CodebookOperation[])
    : [];

  const { cluster_to_codes: dedupedCodes, dedupedCodeCount } = dedupeClusterToCodes(
    cluster_to_codes,
    clusters
  );

  const evidencePayload = parseCodeEvidence(review.code_evidence);

  return {
    review,
    confidence,
    codeEvidence: evidencePayload?.by_open_code ?? {},
    dedupedCodeCount: dedupedCodeCount > 0 ? dedupedCodeCount : undefined,
    codebook: {
      version: typeof v1?.version === "number" ? v1.version : 1,
      clusters,
      operations: [...operations],
      cluster_to_codes: dedupedCodes,
    },
  };
}

export function activeClusterIds(codebook: CodebookPayload): string[] {
  return Object.keys(codebook.cluster_to_codes).filter((cid) => codebook.clusters[cid]?.status !== "drop");
}

export function renameCluster(
  state: WorkingCodebookState,
  clusterId: string,
  label: string
): WorkingCodebookState {
  const prev = state.codebook.clusters[clusterId];
  if (!prev) return state;
  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: {
        ...state.codebook.clusters,
        [clusterId]: {
          ...prev,
          label,
          source: prev.source === "human" ? "human" : "llm+edited",
        },
      },
    },
  };
}

export function rewriteDescription(
  state: WorkingCodebookState,
  clusterId: string,
  description: string
): WorkingCodebookState {
  const prev = state.codebook.clusters[clusterId];
  if (!prev) return state;
  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: {
        ...state.codebook.clusters,
        [clusterId]: {
          ...prev,
          description,
          source: prev.source === "human" ? "human" : "llm+edited",
        },
      },
    },
  };
}

export function toggleNeedsEvidence(
  state: WorkingCodebookState,
  clusterId: string,
  value: boolean
): WorkingCodebookState {
  const prev = state.codebook.clusters[clusterId];
  if (!prev) return state;
  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: {
        ...state.codebook.clusters,
        [clusterId]: { ...prev, needs_more_evidence: value },
      },
    },
  };
}

/** Move one code from a cluster to another (drag & drop). Updates only the code map. */
export function moveCode(
  state: WorkingCodebookState,
  code: string,
  fromClusterId: string,
  toClusterId: string
): WorkingCodebookState {
  if (fromClusterId === toClusterId) return state;
  const fromCodes = state.codebook.cluster_to_codes[fromClusterId];
  if (!fromCodes?.includes(code)) return state;
  if (!state.codebook.clusters[toClusterId] || state.codebook.clusters[toClusterId].status === "drop") {
    return state;
  }
  const toCodes = state.codebook.cluster_to_codes[toClusterId] ?? [];
  if (toCodes.includes(code)) return state;
  return {
    ...state,
    codebook: {
      ...state.codebook,
      cluster_to_codes: {
        ...state.codebook.cluster_to_codes,
        [fromClusterId]: fromCodes.filter((c) => c !== code),
        [toClusterId]: [...toCodes, code],
      },
    },
  };
}

export function dropCluster(
  state: WorkingCodebookState,
  clusterId: string,
  codeDisposition: "delete" | "orphan" = "delete"
): WorkingCodebookState {
  const prev = state.codebook.clusters[clusterId];
  if (!prev) return state;

  const nextClusterToCodes = { ...state.codebook.cluster_to_codes };
  if (codeDisposition === "delete") {
    delete nextClusterToCodes[clusterId];
  } else {
    nextClusterToCodes[clusterId] = [];
  }

  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: {
        ...state.codebook.clusters,
        [clusterId]: { ...prev, status: "drop" },
      },
      cluster_to_codes: nextClusterToCodes,
      operations: [
        ...state.codebook.operations,
        { type: "drop", cluster_id: clusterId, code_disposition: codeDisposition },
      ],
    },
  };
}

export function mergeClusters(
  state: WorkingCodebookState,
  fromIds: string[],
  targetId: string,
  label: string
): WorkingCodebookState | { error: string } {
  const uniqueFrom = [...new Set(fromIds)].filter((id) => state.codebook.clusters[id]?.status !== "drop");
  if (uniqueFrom.length < 2) return { error: "Select at least two clusters to merge." };
  if (!uniqueFrom.includes(targetId)) return { error: "Merge target must be one of the selected clusters." };

  const mergedCodes = new Set<string>();
  for (const id of uniqueFrom) {
    for (const code of state.codebook.cluster_to_codes[id] ?? []) {
      mergedCodes.add(code);
    }
  }

  const nextClusters = { ...state.codebook.clusters };
  const nextClusterToCodes = { ...state.codebook.cluster_to_codes };

  for (const id of uniqueFrom) {
    if (id !== targetId) {
      nextClusters[id] = { ...nextClusters[id], status: "drop" };
      delete nextClusterToCodes[id];
    }
  }

  const targetPrev = nextClusters[targetId];
  nextClusters[targetId] = {
    ...targetPrev,
    label,
    source: "human",
    status: "keep",
  };
  nextClusterToCodes[targetId] = [...mergedCodes];

  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: nextClusters,
      cluster_to_codes: nextClusterToCodes,
      operations: [
        ...state.codebook.operations,
        {
          type: "merge",
          from_cluster_ids: uniqueFrom.filter((id) => id !== targetId),
          target_cluster_id: targetId,
          label,
        },
      ],
    },
  };
}

export function splitCluster(
  state: WorkingCodebookState,
  fromClusterId: string,
  splits: { new_cluster_id: string; label: string; code_ids: string[] }[]
): WorkingCodebookState | { error: string } {
  const sourceCodes = state.codebook.cluster_to_codes[fromClusterId] ?? [];
  if (sourceCodes.length === 0) return { error: "Source cluster has no codes." };
  if (splits.length < 2) return { error: "Split requires at least two groups." };

  const assigned = new Set<string>();
  for (const split of splits) {
    for (const code of split.code_ids) {
      if (!sourceCodes.includes(code)) {
        return { error: `Code "${code}" is not in the source cluster.` };
      }
      if (assigned.has(code)) {
        return { error: `Code "${code}" appears in more than one split group.` };
      }
      assigned.add(code);
    }
  }
  if (assigned.size !== sourceCodes.length) {
    return { error: "Every code in the source cluster must be assigned to exactly one group." };
  }

  const nextClusters = { ...state.codebook.clusters };
  const nextClusterToCodes = { ...state.codebook.cluster_to_codes };

  nextClusters[fromClusterId] = { ...nextClusters[fromClusterId], status: "drop" };
  delete nextClusterToCodes[fromClusterId];

  for (const split of splits) {
    const prev = nextClusters[split.new_cluster_id];
    nextClusters[split.new_cluster_id] = prev
      ? { ...prev, label: split.label, source: "human", status: "keep" }
      : {
          label: split.label,
          description: "",
          confidence: nextClusters[fromClusterId]?.confidence ?? 0,
          source: "human",
          needs_more_evidence: false,
          status: "keep",
        };
    nextClusterToCodes[split.new_cluster_id] = [...split.code_ids];
  }

  return {
    ...state,
    codebook: {
      ...state.codebook,
      clusters: nextClusters,
      cluster_to_codes: nextClusterToCodes,
      operations: [
        ...state.codebook.operations,
        { type: "split", from_cluster_id: fromClusterId, splits },
      ],
    },
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateCodebook(codebook: CodebookPayload): ValidationResult {
  const errors: string[] = [];
  const activeIds = activeClusterIds(codebook);

  if (activeIds.length === 0) {
    errors.push("At least one cluster must remain after edits.");
  }

  const codeOwners = new Map<string, string>();
  for (const cid of activeIds) {
    if (!codebook.clusters[cid]) {
      errors.push(`Missing cluster entry for active cluster "${cid}".`);
      continue;
    }
    for (const code of codebook.cluster_to_codes[cid] ?? []) {
      if (codeOwners.has(code)) {
        errors.push(`Code "${code}" appears in multiple clusters.`);
      } else {
        codeOwners.set(code, cid);
      }
    }
  }

  const clusterIdSet = new Set(Object.keys(codebook.clusters));
  for (const op of codebook.operations) {
    if (op.type === "drop" && !clusterIdSet.has(op.cluster_id)) {
      errors.push(`Drop operation references unknown cluster "${op.cluster_id}".`);
    }
    if (op.type === "merge") {
      for (const id of op.from_cluster_ids) {
        if (!clusterIdSet.has(id)) errors.push(`Merge operation references unknown cluster "${id}".`);
      }
      if (!clusterIdSet.has(op.target_cluster_id)) {
        errors.push(`Merge target "${op.target_cluster_id}" does not exist.`);
      }
    }
    if (op.type === "split" && !clusterIdSet.has(op.from_cluster_id)) {
      errors.push(`Split operation references unknown cluster "${op.from_cluster_id}".`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function sortClusterIdsByConfidence(
  codebook: CodebookPayload,
  ascending = true
): string[] {
  return activeClusterIds(codebook).sort((a, b) => {
    const ca = codebook.clusters[a]?.confidence ?? 0;
    const cb = codebook.clusters[b]?.confidence ?? 0;
    return ascending ? ca - cb : cb - ca;
  });
}

/** Below this cluster count, show every cluster fully (no confidence filter, no 3D overview). */
export const SMALL_CODEBOOK_MAX_CLUSTERS = 8;

export function isSmallCodebook(clusterCount: number): boolean {
  return clusterCount < SMALL_CODEBOOK_MAX_CLUSTERS;
}

/** Clusters with confidence strictly below this value are shown by default in review. */
export const NEEDS_REVIEW_CONFIDENCE_THRESHOLD = 5;

/** User-selectable “below” thresholds on the 0–5 confidence scale. */
export const CONFIDENCE_FILTER_OPTIONS = [1, 2, 3, 4, 5] as const;

export function filterClusterIdsBelowConfidence(
  codebook: CodebookPayload,
  sortedIds: string[],
  belowThreshold: number
): string[] {
  return sortedIds.filter(
    (id) => (codebook.clusters[id]?.confidence ?? 0) < belowThreshold
  );
}

export function clusterNeedsReview(codebook: CodebookPayload, clusterId: string): boolean {
  const confidence = codebook.clusters[clusterId]?.confidence ?? 0;
  return confidence < NEEDS_REVIEW_CONFIDENCE_THRESHOLD;
}

export function filterClusterIdsNeedingReview(
  codebook: CodebookPayload,
  sortedIds: string[]
): string[] {
  return filterClusterIdsBelowConfidence(
    codebook,
    sortedIds,
    NEEDS_REVIEW_CONFIDENCE_THRESHOLD
  );
}

/** Payload PATCHed to Supabase on Approve (one row, `codebook_v2` column). */
export function buildApproveSubmitPayload(codebook: CodebookPayload): {
  status: "approved";
  codebook_v2: CodebookPayload;
  approved_at: string;
} {
  return {
    status: "approved",
    codebook_v2: codebook,
    approved_at: new Date().toISOString(),
  };
}

export function nextSplitClusterId(baseId: string, existingIds: Set<string>, suffix: string): string {
  let candidate = `${baseId}${suffix}`;
  let n = 0;
  while (existingIds.has(candidate)) {
    n += 1;
    candidate = `${baseId}${suffix}${n}`;
  }
  return candidate;
}
