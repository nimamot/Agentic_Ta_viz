import type { CodebookPayload } from "../codebookReview";
import type { SubmitStatus } from "../submitCodebookReview";

export interface PersistReviewToDiskResult {
  ok: boolean;
  written: boolean;
  error?: string;
}

/** Dev server only — POST to Vite middleware that writes public/data/. */
export async function persistReviewToDisk(payload: {
  reviewId: string;
  slug: string;
  status: SubmitStatus;
  codebook_v2?: CodebookPayload | null;
}): Promise<PersistReviewToDiskResult> {
  if (!import.meta.env.DEV) {
    return { ok: false, written: false };
  }

  try {
    const res = await fetch("/api/local/codebook-review/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      return { ok: false, written: false, error: data.error ?? "Failed to write local files" };
    }
    return { ok: true, written: true };
  } catch (err) {
    return {
      ok: false,
      written: false,
      error: err instanceof Error ? err.message : "Could not reach local dev API",
    };
  }
}
