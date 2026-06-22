import type { CodebookPayload } from "../codebookReview";
import type { SubmitCodebookResult, SubmitStatus } from "../submitCodebookReview";
import { downloadJson, getLocalSubmission, isReviewStillPending, recordLocalSubmission } from "./submissions";

export async function submitLocalCodebookReview(
  reviewId: string,
  codebookV2: CodebookPayload | null,
  _loadedUpdatedAt: string | null | undefined,
  status: SubmitStatus
): Promise<SubmitCodebookResult> {
  if (!isReviewStillPending(reviewId)) {
    return { ok: false, alreadySubmitted: true };
  }

  const existing = getLocalSubmission(reviewId);
  if (existing) {
    return { ok: false, alreadySubmitted: true };
  }

  const now = new Date().toISOString();

  if (status === "approved") {
    if (!codebookV2) {
      return { ok: false, error: "Missing codebook payload for approval." };
    }
    recordLocalSubmission(reviewId, {
      status: "approved",
      submitted_at: now,
      codebook_v2: codebookV2,
    });
    downloadJson(`${reviewId}-codebook_v2.json`, codebookV2);
  } else {
    recordLocalSubmission(reviewId, { status: "cancelled", submitted_at: now });
  }

  return { ok: true };
}
