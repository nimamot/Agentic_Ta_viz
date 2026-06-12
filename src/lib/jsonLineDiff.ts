import { createPatch, diffLines } from "diff";

export type DiffLineType = "add" | "remove" | "ctx" | "empty";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface SplitDiffRow {
  left: DiffLine;
  right: DiffLine;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: boolean;
}

export function formatJsonStable(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Sort object keys so line diffs reflect value changes, not key reordering. */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    out[key] = canonicalizeJson(obj[key]);
  }
  return out;
}

export function formatJsonForDiff(value: unknown): string {
  return formatJsonStable(canonicalizeJson(value));
}

function splitPartLines(value: string): string[] {
  if (value === "") return [];
  const trimmed = value.endsWith("\n") ? value.slice(0, -1) : value;
  if (trimmed === "") return [""];
  return trimmed.split("\n");
}

export function computeDiffStats(oldText: string, newText: string): DiffStats {
  const parts = diffLines(oldText, newText);
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    const lineCount = splitPartLines(part.value).length;
    if (part.added) added += lineCount;
    if (part.removed) removed += lineCount;
  }
  return { added, removed, unchanged: added === 0 && removed === 0 };
}

export function buildUnifiedDiffLines(oldText: string, newText: string): DiffLine[] {
  const parts = diffLines(oldText, newText);
  const result: DiffLine[] = [];
  for (const part of parts) {
    const type: DiffLineType = part.added ? "add" : part.removed ? "remove" : "ctx";
    for (const line of splitPartLines(part.value)) {
      result.push({ type, text: line });
    }
  }
  return result;
}

export function buildSplitDiffRows(oldText: string, newText: string): SplitDiffRow[] {
  const parts = diffLines(oldText, newText);
  const rows: SplitDiffRow[] = [];
  for (const part of parts) {
    const lines = splitPartLines(part.value);
    if (part.removed) {
      for (const line of lines) {
        rows.push({
          left: { type: "remove", text: line },
          right: { type: "empty", text: "" },
        });
      }
    } else if (part.added) {
      for (const line of lines) {
        rows.push({
          left: { type: "empty", text: "" },
          right: { type: "add", text: line },
        });
      }
    } else {
      for (const line of lines) {
        rows.push({
          left: { type: "ctx", text: line },
          right: { type: "ctx", text: line },
        });
      }
    }
  }
  return rows;
}

export function buildUnifiedPatch(oldText: string, newText: string, filename = "codebook.json"): string {
  return createPatch(filename, oldText, newText, undefined, undefined, { context: 3 });
}
