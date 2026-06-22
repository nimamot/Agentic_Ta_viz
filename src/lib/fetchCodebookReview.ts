import {
  activeClusterIds,
  buildWorkingCodebook,
  parseCodebookReviewRow,
  type CodebookReviewRow,
  type WorkingCodebookState,
} from "./codebookReview";
import { isLocalMode } from "./dataSource";
import {
  fetchAllPendingLocalCodebookReviews,
  fetchPendingLocalCodebookReviewById,
} from "./local/loadCodebookReviews";
import { getSupabase } from "./supabaseClient";

const TABLE = "codebook_reviews";

export interface PendingCodebookReviewListItem {
  id: string;
  slug: string;
  research_question: string | null;
  created_at: string;
  cluster_count: number;
}

function clusterCountForReview(review: CodebookReviewRow): number {
  return activeClusterIds(buildWorkingCodebook(review).codebook).length;
}

function toListItem(row: CodebookReviewRow): PendingCodebookReviewListItem {
  return {
    id: row.id,
    slug: row.slug,
    research_question: row.research_question,
    created_at: row.created_at,
    cluster_count: clusterCountForReview(row),
  };
}

export async function fetchAllPendingCodebookReviews(): Promise<PendingCodebookReviewListItem[]> {
  if (isLocalMode()) {
    return fetchAllPendingLocalCodebookReviews();
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => toListItem(parseCodebookReviewRow(row as Record<string, unknown>)));
}

export async function fetchPendingCodebookReviewById(
  reviewId: string
): Promise<WorkingCodebookState | null> {
  const id = reviewId.trim();
  if (!id) return null;

  if (isLocalMode()) {
    return fetchPendingLocalCodebookReviewById(id);
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("status", "pending_review")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return buildWorkingCodebook(parseCodebookReviewRow(data as Record<string, unknown>));
}
