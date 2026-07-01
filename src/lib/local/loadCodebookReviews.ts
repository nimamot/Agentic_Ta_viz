import {
  buildWorkingCodebook,
  parseCodebookReviewRow,
  type CodebookReviewRow,
  type WorkingCodebookState,
} from "../codebookReview";
import { reviewDir } from "./config";
import { fetchFirstJson, fetchJsonFile, fetchRequiredJson } from "./fetchFiles";
import { isReviewStillPending } from "./submissions";
import type { LocalManifest, LocalReviewMeta } from "./types";

const CODEBOOK_V1_FILES = ["codebook.json", "codebook_v1.json"];
const CLUSTERED_CODES_FILES = ["gt_clustered_codes.json", "clustered_codes.json"];
const CONFIDENCE_FILES = ["codebook_confidence.json"];

export interface PendingLocalReviewListItem {
  id: string;
  slug: string;
  research_question: string | null;
  created_at: string;
  cluster_count: number;
}

function resolveReviewMeta(folder: string, meta: LocalReviewMeta | null): LocalReviewMeta {
  const slug = meta?.slug?.trim() || folder;
  const id = meta?.id?.trim() || slug;
  const status = meta?.status?.trim() || "pending_review";
  return {
    id,
    slug,
    research_question: meta?.research_question ?? null,
    created_at: meta?.created_at ?? new Date(0).toISOString(),
    updated_at: meta?.updated_at ?? meta?.created_at ?? new Date(0).toISOString(),
    status,
    approved_at: meta?.approved_at,
    cancelled_at: meta?.cancelled_at,
  };
}

function isPendingReviewStatus(status: string | undefined): boolean {
  return !status || status === "pending_review";
}

async function loadReviewRow(folder: string): Promise<CodebookReviewRow> {
  const dir = reviewDir(folder);
  const meta =
    (await fetchFirstJson<LocalReviewMeta>(dir, ["meta.json"], `Review ${folder} meta`)) ?? {};
  const resolved = resolveReviewMeta(folder, meta);

  const codebook_v1 = await fetchRequiredJson<unknown>(
    dir,
    CODEBOOK_V1_FILES,
    `Review ${folder} codebook`
  );
  const clustered_codes = await fetchRequiredJson<unknown>(
    dir,
    CLUSTERED_CODES_FILES,
    `Review ${folder} clustered codes`
  );
  const codebook_confidence =
    (await fetchFirstJson<unknown>(dir, CONFIDENCE_FILES, `Review ${folder} confidence`)) ?? null;

  return parseCodebookReviewRow({
    id: resolved.id,
    slug: resolved.slug,
    research_question: resolved.research_question,
    status: isPendingReviewStatus(resolved.status) ? "pending_review" : resolved.status!,
    codebook_v1,
    clustered_codes,
    codebook_confidence,
    created_at: resolved.created_at,
    updated_at: resolved.updated_at,
  });
}

async function fetchLocalManifest(): Promise<LocalManifest> {
  const root = import.meta.env.VITE_LOCAL_DATA_ROOT?.trim() || "/data";
  const url = `${root.endsWith("/") ? root.slice(0, -1) : root}/manifest.json`;
  try {
    return await fetchJsonFile<LocalManifest>(url, "data manifest");
  } catch {
    return { projects: [], codebook_reviews: [] };
  }
}

function toListItem(review: CodebookReviewRow): PendingLocalReviewListItem {
  const working = buildWorkingCodebook(review);
  const cluster_count = Object.keys(working.codebook.clusters).filter(
    (id) => working.codebook.clusters[id]?.status !== "drop"
  ).length;
  return {
    id: review.id,
    slug: review.slug,
    research_question: review.research_question,
    created_at: review.created_at,
    cluster_count,
  };
}

export async function fetchAllPendingLocalCodebookReviews(): Promise<PendingLocalReviewListItem[]> {
  const manifest = await fetchLocalManifest();
  const folders = manifest.codebook_reviews ?? [];
  const items: PendingLocalReviewListItem[] = [];

  for (const folder of folders) {
    try {
      const dir = reviewDir(folder);
      const meta =
        (await fetchFirstJson<LocalReviewMeta>(dir, ["meta.json"], `Review ${folder} meta`)) ?? {};
      const resolved = resolveReviewMeta(folder, meta);
      if (!isPendingReviewStatus(resolved.status)) continue;

      const row = await loadReviewRow(folder);
      if (!isReviewStillPending(row.id)) continue;
      items.push(toListItem(row));
    } catch {
      // Skip broken review folders; researchers can fix files and refresh.
    }
  }

  items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return items;
}

export async function fetchPendingLocalCodebookReviewById(
  reviewId: string
): Promise<WorkingCodebookState | null> {
  const id = reviewId.trim();
  if (!id) return null;
  if (!isReviewStillPending(id)) return null;

  const manifest = await fetchLocalManifest();
  for (const folder of manifest.codebook_reviews ?? []) {
    try {
      const dir = reviewDir(folder);
      const meta =
        (await fetchFirstJson<LocalReviewMeta>(dir, ["meta.json"], `Review ${folder} meta`)) ?? {};
      const resolved = resolveReviewMeta(folder, meta);
      if (!isPendingReviewStatus(resolved.status)) return null;

      const row = await loadReviewRow(folder);
      if (row.id !== id) continue;
      if (!isReviewStillPending(row.id)) return null;
      return buildWorkingCodebook(row);
    } catch {
      continue;
    }
  }
  return null;
}
