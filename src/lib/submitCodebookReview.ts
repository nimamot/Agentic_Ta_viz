import type { CodebookPayload } from "./codebookReview";
import { isLocalMode } from "./dataSource";
import { submitLocalCodebookReview } from "./local/submitCodebookReview";
import { getSupabase } from "./supabaseClient";

const TABLE = "codebook_reviews";

export type SubmitStatus = "approved" | "cancelled";

export interface SubmitCodebookResult {
  ok: boolean;
  conflict?: boolean;
  alreadySubmitted?: boolean;
  error?: string;
  /** Local mode: written to public/data/ via dev API */
  savedToDisk?: boolean;
}

export interface SubmitCodebookOptions {
  slug?: string;
}

export async function submitCodebookReview(
  reviewId: string,
  codebookV2: CodebookPayload | null,
  loadedUpdatedAt: string | null | undefined,
  status: SubmitStatus,
  options?: SubmitCodebookOptions
): Promise<SubmitCodebookResult> {
  if (isLocalMode()) {
    return submitLocalCodebookReview(reviewId, codebookV2, loadedUpdatedAt, status, options);
  }

  const sb = getSupabase();
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if (status === "approved") {
    payload.codebook_v2 = codebookV2;
    payload.approved_at = now;
  }

  let query = sb.from(TABLE).update(payload).eq("id", reviewId);
  if (loadedUpdatedAt) {
    query = query.eq("updated_at", loadedUpdatedAt);
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    const { data: existing, error: readErr } = await sb
      .from(TABLE)
      .select("status, updated_at")
      .eq("id", reviewId)
      .maybeSingle();

    if (readErr) return { ok: false, error: readErr.message };
    if (!existing) {
      return {
        ok: false,
        error:
          "Submit failed: signed-in users cannot read this review (missing SELECT RLS policy for the authenticated role).",
      };
    }
    if (existing.status !== "pending_review") {
      return { ok: false, alreadySubmitted: true };
    }
    return { ok: false, conflict: true };
  }

  return { ok: true };
}
