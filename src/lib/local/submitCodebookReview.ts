import type { CodebookPayload } from "../codebookReview";
import type { SubmitCodebookResult, SubmitStatus } from "../submitCodebookReview";
import { persistReviewToDisk } from "./persistReviewToDisk";
import { downloadJson, getLocalSubmission, isReviewStillPending, recordLocalSubmission } from "./submissions";

export interface LocalSubmitOptions {
  slug?: string;
}

export async function submitLocalCodebookReview(
  reviewId: string,
  codebookV2: CodebookPayload | null,
  _loadedUpdatedAt: string | null | undefined,
  status: SubmitStatus,
  options?: LocalSubmitOptions
): Promise<SubmitCodebookResult & { savedToDisk?: boolean }> {
  if (!isReviewStillPending(reviewId)) {
    return { ok: false, alreadySubmitted: true };
  }

  const existing = getLocalSubmission(reviewId);
  if (existing) {
    return { ok: false, alreadySubmitted: true };
  }

  const now = new Date().toISOString();
  const slug = options?.slug?.trim();

  if (status === "approved") {
    if (!codebookV2) {
      return { ok: false, error: "Missing codebook payload for approval." };
    }

    let savedToDisk = false;
    if (slug) {
      const disk = await persistReviewToDisk({
        reviewId,
        slug,
        status: "approved",
        codebook_v2: codebookV2,
      });
      if (disk.written) {
        savedToDisk = true;
      } else if (disk.error && import.meta.env.DEV) {
        return { ok: false, error: disk.error };
      }
    }

    recordLocalSubmission(reviewId, {
      status: "approved",
      submitted_at: now,
      codebook_v2: codebookV2,
    });

    if (!savedToDisk) {
      downloadJson(`${reviewId}-codebook_v2.json`, codebookV2);
    }

    return { ok: true, savedToDisk };
  }

  if (slug) {
    const disk = await persistReviewToDisk({
      reviewId,
      slug,
      status: "cancelled",
    });
    if (disk.error && import.meta.env.DEV && !disk.written) {
      return { ok: false, error: disk.error };
    }
  }

  recordLocalSubmission(reviewId, { status: "cancelled", submitted_at: now });
  return { ok: true, savedToDisk: Boolean(slug) };
}
