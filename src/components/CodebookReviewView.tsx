import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CodebookClusterGraph } from "./CodebookClusterGraph";
import type { HighlightedCode } from "./codebookClusterTypes";
import { CodebookReviewJsonPanel } from "./CodebookReviewJsonPanel";
import {
  fetchAllPendingCodebookReviews,
  fetchPendingCodebookReviewById,
  type PendingCodebookReviewListItem,
} from "../lib/fetchCodebookReview";
import { isDataSourceConfigured, isLocalMode } from "../lib/dataSource";
import { GRAPH_CLUSTER_HEXES } from "../lib/graphBuilder";
import {
  buildWorkingCodebook,
  dedupeClusterToCodes,
  dropCluster,
  mergeClusters,
  moveCode,
  nextSplitClusterId,
  renameCluster,
  rewriteDescription,
  filterClusterIdsBelowConfidence,
  CONFIDENCE_FILTER_OPTIONS,
  isSmallCodebook,
  NEEDS_REVIEW_CONFIDENCE_THRESHOLD,
  sortClusterIdsByConfidence,
  splitCluster,
  toggleNeedsEvidence,
  validateCodebook,
  type CodebookPayload,
  type WorkingCodebookState,
} from "../lib/codebookReview";
import { submitCodebookReview } from "../lib/submitCodebookReview";
import { useSupabaseAuth } from "../hooks/useSupabaseAuth";

interface CodebookReviewViewProps {
  reviewId: string | null;
  onReviewIdChange: (id: string | null) => void;
  isDark: boolean;
}

const COLLAPSE_CLUSTERS_BY_DEFAULT_ABOVE = 5;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function confidenceBadgeClass(confidence: number): string {
  if (confidence <= 2) return "codebook-confidence--low";
  if (confidence <= 3) return "codebook-confidence--mid";
  return "codebook-confidence--high";
}

function reviewLabel(item: PendingCodebookReviewListItem): string {
  return item.research_question?.trim() || item.slug;
}

interface DragCodeState {
  code: string;
  fromId: string;
}

interface MergeDraft {
  fromId: string;
  targetId: string;
  label: string;
}

interface SplitGroup {
  id: string;
  label: string;
  codes: string[];
}

export function CodebookReviewView({ reviewId, onReviewIdChange, isDark }: CodebookReviewViewProps) {
  const localMode = isLocalMode();
  const { session, loading: authLoading, authError, signIn, signOut, isAuthenticated } = useSupabaseAuth();
  const canSubmit = localMode || isAuthenticated;

  const [pendingList, setPendingList] = useState<PendingCodebookReviewListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingCodebookState | null>(null);
  const [baselineCodebook, setBaselineCodebook] = useState<CodebookPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Drag & drop
  const [dragCode, setDragCode] = useState<DragCodeState | null>(null);
  const [dragClusterId, setDragClusterId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);

  // Split modal
  const [splitFor, setSplitFor] = useState<string | null>(null);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [splitDragCode, setSplitDragCode] = useState<string | null>(null);
  const [splitDragOver, setSplitDragOver] = useState<number | null>(null);

  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [highlightedCode, setHighlightedCode] = useState<HighlightedCode | null>(null);
  /** `null` = show all clusters; number = show clusters with confidence strictly below this value. */
  const [confidenceFilterBelow, setConfidenceFilterBelow] = useState<number | null>(
    NEEDS_REVIEW_CONFIDENCE_THRESHOLD
  );

  const refreshPendingList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      setPendingList(await fetchAllPendingCodebookReviews());
    } catch (e) {
      setListError((e as Error).message);
      setPendingList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDataSourceConfigured()) void refreshPendingList();
  }, [refreshPendingList]);

  const loadReviewById = useCallback(
    async (targetReviewId: string) => {
      const id = targetReviewId.trim();
      if (!id) return;
      setLoading(true);
      setLoadError(null);
      setSubmitMessage(null);
      setMergeDraft(null);
      setSplitFor(null);
      setHighlightedCode(null);
      setConfidenceFilterBelow(NEEDS_REVIEW_CONFIDENCE_THRESHOLD);
      try {
        const result = await fetchPendingCodebookReviewById(id);
        if (!result) {
          setWorking(null);
          setBaselineCodebook(null);
          setLoadError("This review is no longer pending. Refresh the queue.");
          onReviewIdChange(null);
          void refreshPendingList();
          return;
        }
        setWorking(result);
        setBaselineCodebook(structuredClone(result.codebook));
      } catch (e) {
        setWorking(null);
        setBaselineCodebook(null);
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [onReviewIdChange, refreshPendingList]
  );

  const closeReview = useCallback(() => {
    setWorking(null);
    setBaselineCodebook(null);
    setLoadError(null);
    setSubmitMessage(null);
    setMergeDraft(null);
    setSplitFor(null);
    setHighlightedCode(null);
    setConfidenceFilterBelow(NEEDS_REVIEW_CONFIDENCE_THRESHOLD);
    onReviewIdChange(null);
    void refreshPendingList();
  }, [onReviewIdChange, refreshPendingList]);

  useEffect(() => {
    const id = reviewId?.trim();
    if (!id) {
      setWorking(null);
      setBaselineCodebook(null);
      return;
    }
    if (working?.review.id === id) return;
    void loadReviewById(id);
  }, [reviewId, loadReviewById, working?.review.id]);

  const sortedClusterIds = useMemo(
    () => (working ? sortClusterIdsByConfidence(working.codebook, true) : []),
    [working]
  );

  const attentionClusterIds = useMemo(
    () =>
      working
        ? filterClusterIdsBelowConfidence(
            working.codebook,
            sortedClusterIds,
            NEEDS_REVIEW_CONFIDENCE_THRESHOLD
          )
        : [],
    [working, sortedClusterIds]
  );

  const confidenceFilterCounts = useMemo(() => {
    if (!working) return new Map<number, number>();
    const counts = new Map<number, number>();
    for (const n of CONFIDENCE_FILTER_OPTIONS) {
      counts.set(
        n,
        filterClusterIdsBelowConfidence(working.codebook, sortedClusterIds, n).length
      );
    }
    return counts;
  }, [working, sortedClusterIds]);

  const filteredClusterIds = useMemo(() => {
    if (!working || confidenceFilterBelow === null) return sortedClusterIds;
    return filterClusterIdsBelowConfidence(
      working.codebook,
      sortedClusterIds,
      confidenceFilterBelow
    );
  }, [working, sortedClusterIds, confidenceFilterBelow]);

  const showingAllClusters = confidenceFilterBelow === null;

  const visibleClusterIds = filteredClusterIds;

  /** Few visible clusters → full 3D detail (all codes, no overview dots), even when the codebook is large. */
  const fullDetailView = isSmallCodebook(visibleClusterIds.length);

  const visibleCodeCount = useMemo(() => {
    if (!working) return 0;
    return visibleClusterIds.reduce(
      (sum, cid) => sum + (working.codebook.cluster_to_codes[cid]?.length ?? 0),
      0
    );
  }, [working, visibleClusterIds]);

  useEffect(() => {
    if (showingAllClusters || !working || !highlightedCode) return;
    if (!filteredClusterIds.includes(highlightedCode.clusterId)) {
      setHighlightedCode(null);
    }
  }, [showingAllClusters, working, highlightedCode, filteredClusterIds]);

  useEffect(() => {
    if (!working) return;
    if (visibleClusterIds.length <= COLLAPSE_CLUSTERS_BY_DEFAULT_ABOVE) {
      setExpandedClusters(new Set(visibleClusterIds));
    } else {
      setExpandedClusters(new Set());
    }
  }, [working?.review.id, visibleClusterIds]);

  const expandAllClusters = useCallback(() => {
    setExpandedClusters(new Set(visibleClusterIds));
  }, [visibleClusterIds]);

  const collapseAllClusters = useCallback(() => {
    setExpandedClusters(new Set());
  }, []);

  const toggleClusterExpanded = useCallback((clusterId: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  const normalizedReviewId = useRef<string | null>(null);

  useEffect(() => {
    normalizedReviewId.current = null;
  }, [reviewId]);

  useEffect(() => {
    if (!working) return;
    if (normalizedReviewId.current === working.review.id) return;
    const { cluster_to_codes, dedupedCodeCount } = dedupeClusterToCodes(
      working.codebook.cluster_to_codes,
      working.codebook.clusters
    );
    normalizedReviewId.current = working.review.id;
    if (dedupedCodeCount === 0) return;
    setWorking((w) =>
      !w
        ? w
        : {
            ...w,
            dedupedCodeCount,
            codebook: { ...w.codebook, cluster_to_codes },
          }
    );
  }, [working]);

  /** Stable color per cluster id: indexed by insertion order in the clusters map. */
  const clusterColor = useMemo(() => {
    const map = new Map<string, string>();
    if (working) {
      Object.keys(working.codebook.clusters).forEach((cid, i) => {
        map.set(cid, GRAPH_CLUSTER_HEXES[i % GRAPH_CLUSTER_HEXES.length]);
      });
    }
    return map;
  }, [working]);

  const selectCode = useCallback((code: string, clusterId: string) => {
    setHighlightedCode({ code, clusterId });
    setExpandedClusters((prev) => new Set(prev).add(clusterId));
  }, []);

  const clearCodeSelection = useCallback(() => {
    setHighlightedCode(null);
  }, []);

  const handleMoveCodeFrom3D = useCallback(
    (code: string, fromClusterId: string, toClusterId: string) => {
      setWorking((w) => (w ? moveCode(w, code, fromClusterId, toClusterId) : w));
      setHighlightedCode({ code, clusterId: toClusterId });
      setExpandedClusters((prev) => new Set(prev).add(toClusterId));
    },
    []
  );

  const syncExpandedClustersFrom3D = useCallback((clusterIds: string[]) => {
    setExpandedClusters(new Set(clusterIds));
  }, []);

  const totalCodes = useMemo(() => {
    if (!working) return 0;
    return sortedClusterIds.reduce(
      (sum, cid) => sum + (working.codebook.cluster_to_codes[cid]?.length ?? 0),
      0
    );
  }, [working, sortedClusterIds]);

  const validation = useMemo(
    () => (working ? validateCodebook(working.codebook) : { ok: false, errors: [] }),
    [working]
  );

  // ── Drag & drop: codes between clusters, cluster-onto-cluster merge ──

  const handleTileDragOver = (e: DragEvent, cid: string) => {
    if (!dragCode && !dragClusterId) return;
    if (dragCode?.fromId === cid) return;
    if (dragClusterId === cid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(cid);
  };

  const handleTileDrop = (e: DragEvent, cid: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (dragCode && dragCode.fromId !== cid) {
      setWorking((w) => (w ? moveCode(w, dragCode.code, dragCode.fromId, cid) : w));
      setDragCode(null);
      return;
    }
    if (dragClusterId && dragClusterId !== cid && working) {
      setMergeDraft({
        fromId: dragClusterId,
        targetId: cid,
        label: working.codebook.clusters[cid]?.label ?? "",
      });
      setDragClusterId(null);
    }
  };

  const clearDrag = () => {
    setDragCode(null);
    setDragClusterId(null);
    setDragOverId(null);
  };

  const confirmMerge = useCallback(() => {
    if (!working || !mergeDraft) return;
    const label = mergeDraft.label.trim() || working.codebook.clusters[mergeDraft.targetId]?.label || "Merged cluster";
    const result = mergeClusters(working, [mergeDraft.fromId, mergeDraft.targetId], mergeDraft.targetId, label);
    if ("error" in result) {
      setSubmitMessage(result.error);
    } else {
      setWorking(result);
      setSubmitMessage(null);
    }
    setMergeDraft(null);
  }, [working, mergeDraft]);

  // ── Split modal ──

  const beginSplit = useCallback(
    (cid: string) => {
      if (!working) return;
      const codes = working.codebook.cluster_to_codes[cid] ?? [];
      const existing = new Set(Object.keys(working.codebook.clusters));
      const idA = nextSplitClusterId(cid, existing, "a");
      const idB = nextSplitClusterId(cid, existing, "b");
      const baseLabel = working.codebook.clusters[cid]?.label ?? cid;
      const half = Math.ceil(codes.length / 2);
      setSplitGroups([
        { id: idA, label: `${baseLabel} (A)`, codes: codes.slice(0, half) },
        { id: idB, label: `${baseLabel} (B)`, codes: codes.slice(half) },
      ]);
      setSplitFor(cid);
    },
    [working]
  );

  const addSplitGroup = useCallback(() => {
    if (!working || !splitFor) return;
    const existing = new Set([
      ...Object.keys(working.codebook.clusters),
      ...splitGroups.map((g) => g.id),
    ]);
    const suffix = String.fromCharCode(97 + splitGroups.length); // a, b, c…
    const id = nextSplitClusterId(splitFor, existing, suffix);
    const baseLabel = working.codebook.clusters[splitFor]?.label ?? splitFor;
    setSplitGroups((gs) => [
      ...gs,
      { id, label: `${baseLabel} (${suffix.toUpperCase()})`, codes: [] },
    ]);
  }, [working, splitFor, splitGroups]);

  const moveSplitCode = (code: string, toIndex: number) => {
    setSplitGroups((groups) =>
      groups.map((g, i) => ({
        ...g,
        codes:
          i === toIndex
            ? g.codes.includes(code)
              ? g.codes
              : [...g.codes, code]
            : g.codes.filter((c) => c !== code),
      }))
    );
  };

  const applySplit = useCallback(() => {
    if (!splitFor || !working) return;
    const groups = splitGroups.filter((g) => g.codes.length > 0);
    const result = splitCluster(
      working,
      splitFor,
      groups.map((g) => ({ new_cluster_id: g.id, label: g.label, code_ids: g.codes }))
    );
    if ("error" in result) {
      setSubmitMessage(result.error);
      return;
    }
    setWorking(result);
    setSplitFor(null);
    setSubmitMessage(null);
  }, [splitFor, working, splitGroups]);

  // ── Submit / cancel ──

  const handleApprove = useCallback(async () => {
    if (!working || !validation.ok) return;
    if (!canSubmit) {
      setSubmitMessage("Sign in to submit an approved codebook.");
      return;
    }
    const { cluster_to_codes } = dedupeClusterToCodes(
      working.codebook.cluster_to_codes,
      working.codebook.clusters
    );
    const codebookToSubmit = { ...working.codebook, cluster_to_codes };
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const result = await submitCodebookReview(
        working.review.id,
        codebookToSubmit,
        working.review.updated_at,
        "approved"
      );
      if (result.ok) {
        setSubmitMessage(
          localMode
            ? "Approved. Your codebook_v2.json file was downloaded — place it back in your pipeline output folder."
            : "Approved and submitted. The pipeline can continue refinement."
        );
        closeReview();
      } else if (result.alreadySubmitted) {
        setSubmitMessage("This review was already submitted.");
      } else if (result.conflict) {
        setSubmitMessage("Another session changed this review. Reload to get the latest version.");
      } else {
        setSubmitMessage(result.error ?? "Submit failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [working, validation.ok, canSubmit, localMode, closeReview]);

  const handleCancel = useCallback(async () => {
    if (!working) return;
    if (!canSubmit) {
      setSubmitMessage("Sign in to cancel a review.");
      return;
    }
    if (!window.confirm("Cancel this review? The pipeline wait loop will time out.")) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const result = await submitCodebookReview(working.review.id, null, working.review.updated_at, "cancelled");
      if (result.ok) {
        setSubmitMessage("Review cancelled.");
        closeReview();
      } else if (result.conflict) {
        setSubmitMessage("Concurrent edit detected. Reload and try again.");
      } else {
        setSubmitMessage(result.error ?? "Cancel failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [working, canSubmit, closeReview]);

  if (!isDataSourceConfigured()) {
    return (
      <div className="codebook-page" data-theme={isDark ? "dark" : "light"}>
        <div className="library-config-hint">
          {localMode ? (
            <>
              Place codebook review files under <code>public/data/codebook-reviews/</code> (see{" "}
              <code>LOCAL.md</code>).
            </>
          ) : (
            <>
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to load codebook reviews.
            </>
          )}
        </div>
      </div>
    );
  }

  const splitSourceColor = splitFor ? clusterColor.get(splitFor) ?? GRAPH_CLUSTER_HEXES[0] : GRAPH_CLUSTER_HEXES[0];

  return (
    <div className="codebook-page" data-theme={isDark ? "dark" : "light"}>
      <div className="codebook-shell">
        <div className="library-toolbar-min codebook-toolbar">
          <div className="library-toolbar-min-row">
            {working ? (
              <button type="button" className="library-mini-btn" onClick={closeReview}>
                ← Back to queue
              </button>
            ) : (
              <>
                <span className="library-toolbar-label">Pending reviews</span>
                <button
                  type="button"
                  className="library-btn library-btn--primary"
                  onClick={() => void refreshPendingList()}
                  disabled={listLoading}
                >
                  {listLoading ? "Refreshing…" : "Refresh"}
                </button>
              </>
            )}
            {working && loading && <span className="library-chip library-chip--muted">Loading…</span>}
          </div>

          {!localMode && (
            <div className="codebook-auth">
              {authLoading ? (
                <span className="library-chip library-chip--muted">Checking auth…</span>
              ) : isAuthenticated ? (
                <>
                  <span className="library-chip" title={session?.user.email ?? ""}>
                    {session?.user.email}
                  </span>
                  <button type="button" className="library-mini-btn" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </>
              ) : (
                <form
                  className="codebook-auth-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void signIn(email, password);
                  }}
                >
                  <input
                    type="email"
                    className="library-select codebook-auth-input"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    className="library-select codebook-auth-input"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="submit" className="library-mini-btn">
                    Sign in
                  </button>
                </form>
              )}
              {authError && <span className="codebook-auth-error">{authError}</span>}
            </div>
          )}
          {localMode && (
            <span className="library-chip library-chip--muted" title="Local file mode">
              Local mode — no sign-in required
            </span>
          )}
        </div>

        {loadError && <div className="library-banner library-banner--error">{loadError}</div>}
        {submitMessage && (
          <div className={`library-banner ${submitMessage.includes("Approved") ? "" : "library-banner--error"}`}>
            {submitMessage}
          </div>
        )}
        {working?.dedupedCodeCount != null && working.dedupedCodeCount > 0 && (
          <div className="library-banner codebook-dedupe-banner" role="status">
            Resolved {working.dedupedCodeCount} duplicate code
            {working.dedupedCodeCount === 1 ? "" : "s"} from the pipeline data — each code is now in one
            cluster only (kept in the lowest-confidence cluster). You can approve when ready.
          </div>
        )}

        {!working && !loadError && (
          <div className="codebook-queue glass-panel">
            <div className="library-panel-head">
              <div className="library-panel-head-text">
                <h4>Waiting for review</h4>
                <span className="library-panel-sub">
                  {listLoading
                    ? "Loading queue…"
                    : `${pendingList.length} pending ${pendingList.length === 1 ? "job" : "jobs"}`}
                </span>
              </div>
            </div>
            {listError && <div className="library-banner library-banner--error">{listError}</div>}
            {!listLoading && pendingList.length === 0 && !listError && (
              <p className="library-empty-body codebook-queue-empty">
                No pending reviews right now. When the pipeline uploads a codebook, it will appear here.
              </p>
            )}
            <ul className="codebook-queue-list">
              {pendingList.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="codebook-queue-card"
                    onClick={() => onReviewIdChange(item.id)}
                    disabled={loading}
                  >
                    <div className="codebook-queue-card-main">
                      <span className="codebook-queue-title">{reviewLabel(item)}</span>
                      <span className="codebook-queue-slug">{item.slug}</span>
                    </div>
                    <div className="codebook-queue-card-meta">
                      <span className="library-chip">{item.cluster_count} clusters</span>
                      <span className="library-chip library-chip--muted">{formatWhen(item.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {working && (
          <>
            <header className="glass-panel codebook-header">
              <h2 className="codebook-header-question">
                {working.review.research_question?.trim() || "Research question not set"}
              </h2>
              <div className="codebook-header-meta">
                <span className="library-chip">{working.review.slug}</span>
                <span className="library-chip library-chip--muted">ID {working.review.id.slice(0, 8)}…</span>
                <span className="library-chip library-chip--muted">{formatWhen(working.review.created_at)}</span>
                <span className="library-chip">{sortedClusterIds.length} clusters</span>
                <span className="library-chip library-chip--muted">{totalCodes} codes</span>
                {!showingAllClusters && filteredClusterIds.length < sortedClusterIds.length && (
                  <span className="library-chip library-chip--accent">
                    {filteredClusterIds.length} shown
                  </span>
                )}
              </div>
            </header>

            <div className="glass-panel codebook-attention-banner" role="status">
              <div className="codebook-attention-banner-text">
                {showingAllClusters ? (
                  <>
                    <strong>Showing all clusters.</strong> You are viewing every cluster in this codebook.
                    Use the confidence filter to narrow the list, or approve as-is if everything looks good.
                  </>
                ) : filteredClusterIds.length === 0 ? (
                  <>
                    <strong>No clusters need your attention.</strong> Every cluster is at confidence{" "}
                    {NEEDS_REVIEW_CONFIDENCE_THRESHOLD} or higher on the 0–5 scale. You can spot-check with
                    &ldquo;Show all clusters&rdquo; or tighten the filter to review lower-confidence groups.
                  </>
                ) : confidenceFilterBelow === NEEDS_REVIEW_CONFIDENCE_THRESHOLD ? (
                  <>
                    <strong>Clusters that need your attention.</strong> Showing {filteredClusterIds.length} of{" "}
                    {sortedClusterIds.length} clusters with confidence below {NEEDS_REVIEW_CONFIDENCE_THRESHOLD}.
                    High-confidence clusters are hidden by default.
                  </>
                ) : (
                  <>
                    <strong>Filtered by confidence.</strong> Showing {filteredClusterIds.length} of{" "}
                    {sortedClusterIds.length} clusters with confidence below {confidenceFilterBelow}.
                  </>
                )}
              </div>
              <div className="codebook-attention-banner-actions">
                <label className="codebook-confidence-filter">
                  <span className="codebook-confidence-filter-label">Show clusters</span>
                  <select
                    className="library-select codebook-confidence-filter-select"
                    value={confidenceFilterBelow === null ? "all" : String(confidenceFilterBelow)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setConfidenceFilterBelow(
                        v === "all" ? null : Number.parseInt(v, 10)
                      );
                    }}
                  >
                    <option value="all">All clusters ({sortedClusterIds.length})</option>
                    <option value={String(NEEDS_REVIEW_CONFIDENCE_THRESHOLD)}>
                      Needs review — below {NEEDS_REVIEW_CONFIDENCE_THRESHOLD} (
                      {attentionClusterIds.length})
                    </option>
                    {[4, 3, 2, 1]
                      .filter((n) => n < NEEDS_REVIEW_CONFIDENCE_THRESHOLD)
                      .map((n) => (
                        <option key={n} value={String(n)}>
                          Confidence below {n} ({confidenceFilterCounts.get(n) ?? 0})
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>

            <p className="codebook-board-hint">
              {fullDetailView ? (
                <>
                  <strong>Cluster map</strong> — toggle 2D / 3D above the map. {visibleClusterIds.length} cluster
                  {visibleClusterIds.length === 1 ? "" : "s"} shown with full code detail. Click a code node to
                  highlight it in the board. Drag a code onto another cluster to move it.
                </>
              ) : (
                <>
                  <strong>Cluster map</strong> — toggle 2D / 3D above the map. Click cluster nodes to expand codes
                  (multiple at once), or click a code node to highlight it in the board below. Drag a{" "}
                  <strong>code node</strong> onto another cluster to move it. On the board: drag a{" "}
                  <strong>code chip</strong> to move it, or drag a <strong>cluster header</strong> to merge. Lowest
                  confidence first.
                </>
              )}
            </p>

            {mergeDraft && working.codebook.clusters[mergeDraft.fromId] && working.codebook.clusters[mergeDraft.targetId] && (
              <div className="glass-panel codebook-merge-confirm">
                <span className="codebook-merge-confirm-text">
                  Merge{" "}
                  <span
                    className="codebook-merge-pill"
                    style={{ ["--cluster-color" as string]: clusterColor.get(mergeDraft.fromId) }}
                  >
                    {working.codebook.clusters[mergeDraft.fromId].label || `#${mergeDraft.fromId}`}
                  </span>{" "}
                  into{" "}
                  <span
                    className="codebook-merge-pill"
                    style={{ ["--cluster-color" as string]: clusterColor.get(mergeDraft.targetId) }}
                  >
                    {working.codebook.clusters[mergeDraft.targetId].label || `#${mergeDraft.targetId}`}
                  </span>
                </span>
                <input
                  className="library-select codebook-merge-label"
                  placeholder="Label for the merged cluster"
                  value={mergeDraft.label}
                  onChange={(e) => setMergeDraft((d) => (d ? { ...d, label: e.target.value } : d))}
                  autoFocus
                />
                <button type="button" className="library-btn library-btn--primary" onClick={confirmMerge}>
                  Merge
                </button>
                <button type="button" className="library-mini-btn" onClick={() => setMergeDraft(null)}>
                  Cancel
                </button>
              </div>
            )}

            <div className="codebook-dual-view">
              <CodebookClusterGraph
                key={`${working.review.id}-${showingAllClusters ? "all" : `below-${confidenceFilterBelow}`}-${fullDetailView ? "full" : "overview"}`}
                sortedClusterIds={visibleClusterIds}
                clusterToCodes={working.codebook.cluster_to_codes}
                clusterColor={clusterColor}
                clusters={working.codebook.clusters}
                highlighted={highlightedCode}
                onSelectCode={selectCode}
                onClearSelection={clearCodeSelection}
                onMoveCode={handleMoveCodeFrom3D}
                onExpandedClustersChange={syncExpandedClustersFrom3D}
                isSmallCodebook={fullDetailView}
                totalClusterCount={sortedClusterIds.length}
                isDark={isDark}
              />

            <div className="codebook-board-section">
              <div className="codebook-board-section-head">
                <h4>Cluster board</h4>
                <span className="library-panel-sub">
                  {fullDetailView
                    ? `${visibleClusterIds.length} clusters · all codes shown · drag & drop editing`
                    : showingAllClusters
                      ? `${visibleClusterIds.length} clusters · ${visibleCodeCount} codes · drag & drop editing`
                      : filteredClusterIds.length === 0
                        ? `0 clusters match filter · ${sortedClusterIds.length} total`
                        : `${filteredClusterIds.length} of ${sortedClusterIds.length} clusters · ${visibleCodeCount} codes · confidence below ${confidenceFilterBelow}`}
                </span>
                {visibleClusterIds.length > COLLAPSE_CLUSTERS_BY_DEFAULT_ABOVE && (
                  <div className="codebook-board-section-actions">
                    <button type="button" className="library-mini-btn" onClick={expandAllClusters}>
                      Expand all
                    </button>
                    <button type="button" className="library-mini-btn" onClick={collapseAllClusters}>
                      Collapse all
                    </button>
                  </div>
                )}
              </div>
            <div className="codebook-board">
              {visibleClusterIds.length === 0 && !showingAllClusters && (
                <p className="library-empty-body codebook-board-empty">
                  No clusters match this confidence filter. Try a higher threshold, or use &ldquo;Show all
                  clusters&rdquo; above to browse the full codebook.
                </p>
              )}
              {visibleClusterIds.map((cid) => {
                const c = working.codebook.clusters[cid];
                const codes = working.codebook.cluster_to_codes[cid] ?? [];
                const conf = working.confidence[cid];
                const color = clusterColor.get(cid) ?? GRAPH_CLUSTER_HEXES[0];
                const isDropTarget = dragOverId === cid;
                const isHighlightCluster = highlightedCode?.clusterId === cid;
                const isClusterExpanded = expandedClusters.has(cid) || isHighlightCluster;
                return (
                  <section
                    key={cid}
                    className={`codebook-tile ${isDropTarget ? "codebook-tile--dragover" : ""} ${
                      isHighlightCluster ? "codebook-tile--highlighted" : ""
                    } ${isClusterExpanded ? "" : "codebook-tile--collapsed"}`}
                    style={{ ["--cluster-color" as string]: color }}
                    onDragOver={(e) => handleTileDragOver(e, cid)}
                    onDragLeave={() => setDragOverId((prev) => (prev === cid ? null : prev))}
                    onDrop={(e) => handleTileDrop(e, cid)}
                  >
                    <div className="codebook-tile-head">
                      <span
                        className="codebook-tile-grip"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", `cluster:${cid}`);
                          setDragClusterId(cid);
                        }}
                        onDragEnd={clearDrag}
                        title="Drag onto another cluster to merge"
                        aria-hidden
                      >
                        ⠿
                      </span>
                      <button
                        type="button"
                        className="codebook-tile-toggle"
                        onClick={() => toggleClusterExpanded(cid)}
                        aria-expanded={isClusterExpanded}
                        aria-label={isClusterExpanded ? "Collapse cluster" : "Expand cluster"}
                      >
                        <span className="codebook-tile-chevron" aria-hidden>
                          {isClusterExpanded ? "▾" : "▸"}
                        </span>
                      </button>
                      <span className="codebook-tile-id">#{cid}</span>
                      <span className={`codebook-confidence ${confidenceBadgeClass(c.confidence)}`}>
                        {c.confidence}/5
                      </span>
                      {c.source !== "llm" && <span className="codebook-tile-source">{c.source}</span>}
                      <span className="codebook-tile-count">{codes.length} codes</span>
                      {!isClusterExpanded && (
                        <button
                          type="button"
                          className="codebook-tile-label-preview"
                          onClick={() => toggleClusterExpanded(cid)}
                        >
                          {c.label?.trim() || "Untitled cluster"}
                        </button>
                      )}
                    </div>

                    {isClusterExpanded && (
                      <>
                    <input
                      className="codebook-tile-label"
                      value={c.label}
                      placeholder="Cluster label…"
                      onChange={(e) => setWorking((w) => (w ? renameCluster(w, cid, e.target.value) : w))}
                    />

                    {conf?.candidate_labels && conf.candidate_labels.length > 0 && (
                      <div className="codebook-tile-candidates">
                        {conf.candidate_labels.map((lbl) => (
                          <button
                            key={lbl}
                            type="button"
                            className="codebook-candidate-chip"
                            title="Use this label"
                            onClick={() => setWorking((w) => (w ? renameCluster(w, cid, lbl) : w))}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      className="codebook-tile-desc"
                      rows={2}
                      placeholder="Description / rationale…"
                      value={c.description}
                      onChange={(e) => setWorking((w) => (w ? rewriteDescription(w, cid, e.target.value) : w))}
                    />

                    <div className="codebook-chips">
                      {codes.map((code) => {
                        const isHighlighted =
                          highlightedCode?.code === code && highlightedCode.clusterId === cid;
                        return (
                        <span
                          key={code}
                          className={`codebook-chip ${
                            dragCode?.code === code && dragCode.fromId === cid ? "codebook-chip--dragging" : ""
                          } ${isHighlighted ? "codebook-chip--highlighted" : ""}`}
                          draggable
                          onClick={() => selectCode(code, cid)}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", code);
                            setDragCode({ code, fromId: cid });
                            selectCode(code, cid);
                          }}
                          onDragEnd={clearDrag}
                          title="Click to highlight in 3D · drag onto another cluster to move"
                        >
                          {code}
                        </span>
                        );
                      })}
                      {codes.length === 0 && <span className="codebook-chips-empty">No codes — drop some here</span>}
                    </div>

                    <div className="codebook-tile-foot">
                      <button
                        type="button"
                        className={`codebook-flag-btn ${c.needs_more_evidence ? "codebook-flag-btn--active" : ""}`}
                        onClick={() => setWorking((w) => (w ? toggleNeedsEvidence(w, cid, !c.needs_more_evidence) : w))}
                        title="Flag: pipeline will skip LLM refinement moves for this cluster"
                      >
                        ⚑ {c.needs_more_evidence ? "Needs evidence" : "Flag evidence"}
                      </button>
                      <div className="codebook-tile-foot-spacer" />
                      <button
                        type="button"
                        className="library-mini-btn"
                        onClick={() => beginSplit(cid)}
                        disabled={codes.length < 2}
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        className="library-mini-btn codebook-btn-danger"
                        onClick={() => {
                          if (!window.confirm(`Drop cluster "${c.label || cid}"? Its codes will be removed.`)) return;
                          setWorking((w) => (w ? dropCluster(w, cid) : w));
                        }}
                      >
                        Drop
                      </button>
                    </div>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
            </div>
            </div>

            {baselineCodebook && (
              <CodebookReviewJsonPanel
                review={working.review}
                codebook={working.codebook}
                baselineCodebook={baselineCodebook}
              />
            )}

            <footer className="glass-panel codebook-footer">
              {!validation.ok && validation.errors.length > 0 && (
                <ul className="codebook-validation-errors">
                  {validation.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
              <div className="codebook-footer-actions">
                <button
                  type="button"
                  className="library-btn library-btn--primary"
                  disabled={!validation.ok || submitting || !canSubmit}
                  title={
                    !canSubmit
                      ? "Sign in to submit"
                      : !validation.ok
                        ? "Fix validation errors below before submitting"
                        : undefined
                  }
                  onClick={() => void handleApprove()}
                >
                  {submitting
                    ? "Submitting…"
                    : localMode
                      ? "Approve & export"
                      : "Approve & submit"}
                </button>
                <button
                  type="button"
                  className="library-mini-btn"
                  disabled={submitting || !canSubmit}
                  onClick={() => void handleCancel()}
                >
                  Cancel review
                </button>
                <button
                  type="button"
                  className="library-mini-btn"
                  onClick={() => working && setWorking(buildWorkingCodebook(working.review))}
                >
                  Reset edits
                </button>
                {!canSubmit && (
                  <span className="library-panel-sub">Sign in to submit or cancel.</span>
                )}
                {canSubmit && !validation.ok && (
                  <span className="library-panel-sub codebook-footer-hint">
                    Fix the issues above to enable Approve &amp; submit.
                  </span>
                )}
              </div>
            </footer>
          </>
        )}

        {splitFor && working && (
          <div className="codebook-split-overlay" onClick={() => setSplitFor(null)} role="dialog" aria-modal="true">
            <div
              className="codebook-split-modal glass-panel"
              style={{ ["--cluster-color" as string]: splitSourceColor }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="codebook-split-head">
                <h4>
                  Split “{working.codebook.clusters[splitFor]?.label || `#${splitFor}`}”
                </h4>
                <p className="library-panel-sub">
                  Drag each code into a group. Every code must land in exactly one group.
                </p>
              </div>
              <div className="codebook-split-cols">
                {splitGroups.map((group, gi) => (
                  <div
                    key={group.id}
                    className={`codebook-split-col ${splitDragOver === gi ? "codebook-split-col--dragover" : ""}`}
                    style={{
                      ["--cluster-color" as string]:
                        GRAPH_CLUSTER_HEXES[(gi + 1) % GRAPH_CLUSTER_HEXES.length],
                    }}
                    onDragOver={(e) => {
                      if (!splitDragCode) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setSplitDragOver(gi);
                    }}
                    onDragLeave={() => setSplitDragOver((prev) => (prev === gi ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSplitDragOver(null);
                      if (splitDragCode) {
                        moveSplitCode(splitDragCode, gi);
                        setSplitDragCode(null);
                      }
                    }}
                  >
                    <input
                      className="codebook-tile-label codebook-split-col-label"
                      value={group.label}
                      onChange={(e) =>
                        setSplitGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, label: e.target.value } : g)))
                      }
                    />
                    <div className="codebook-chips codebook-chips--split">
                      {group.codes.map((code) => (
                        <span
                          key={code}
                          className={`codebook-chip ${splitDragCode === code ? "codebook-chip--dragging" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", code);
                            setSplitDragCode(code);
                          }}
                          onDragEnd={() => {
                            setSplitDragCode(null);
                            setSplitDragOver(null);
                          }}
                        >
                          {code}
                        </span>
                      ))}
                      {group.codes.length === 0 && <span className="codebook-chips-empty">Drop codes here</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="codebook-split-actions">
                <button type="button" className="library-mini-btn" onClick={addSplitGroup}>
                  + Add group
                </button>
                <div className="codebook-tile-foot-spacer" />
                <button
                  type="button"
                  className="library-btn library-btn--primary"
                  onClick={applySplit}
                  disabled={splitGroups.filter((g) => g.codes.length > 0).length < 2}
                >
                  Apply split
                </button>
                <button type="button" className="library-mini-btn" onClick={() => setSplitFor(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
