import type { LocalSubmissionRecord } from "./types";

const STORAGE_KEY = "graph-builder-local-submissions";

function readAll(): Record<string, LocalSubmissionRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, LocalSubmissionRecord>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LocalSubmissionRecord>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getLocalSubmission(reviewId: string): LocalSubmissionRecord | null {
  return readAll()[reviewId] ?? null;
}

export function isReviewStillPending(reviewId: string): boolean {
  return getLocalSubmission(reviewId) == null;
}

export function recordLocalSubmission(
  reviewId: string,
  record: LocalSubmissionRecord
): void {
  const map = readAll();
  map[reviewId] = record;
  writeAll(map);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
