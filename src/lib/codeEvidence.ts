export interface CodeEvidenceSnippet {
  snippet_id: string;
  review_id: number;
  source_id: string | null;
  quote: string;
  note: string;
}

export interface CodeEvidenceEntry {
  quote_count: number;
  review_count: number;
  primary: CodeEvidenceSnippet | null;
  snippets: CodeEvidenceSnippet[];
}

export interface CodeEvidencePayload {
  version: number;
  slug: string;
  research_question?: string;
  generated_at?: string;
  by_open_code: Record<string, CodeEvidenceEntry>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSnippet(raw: unknown): CodeEvidenceSnippet | null {
  const o = asRecord(raw);
  if (!o || typeof o.quote !== "string") return null;
  return {
    snippet_id: typeof o.snippet_id === "string" ? o.snippet_id : "",
    review_id: typeof o.review_id === "number" ? o.review_id : 0,
    source_id: typeof o.source_id === "string" ? o.source_id : null,
    quote: o.quote,
    note: typeof o.note === "string" ? o.note : "",
  };
}

function parseEntry(raw: unknown): CodeEvidenceEntry | null {
  const o = asRecord(raw);
  if (!o) return null;
  const primaryRaw = o.primary;
  const primary =
    primaryRaw === null ? null : parseSnippet(primaryRaw);
  const snippetsRaw = o.snippets;
  const snippets = Array.isArray(snippetsRaw)
    ? snippetsRaw.map(parseSnippet).filter((s): s is CodeEvidenceSnippet => s != null)
    : [];
  return {
    quote_count: typeof o.quote_count === "number" ? o.quote_count : snippets.length,
    review_count: typeof o.review_count === "number" ? o.review_count : 0,
    primary,
    snippets,
  };
}

export function parseCodeEvidence(raw: unknown): CodeEvidencePayload | null {
  const o = asRecord(raw);
  const byOpenRaw = o ? asRecord(o.by_open_code) : null;
  if (!o || !byOpenRaw) return null;

  const by_open_code: Record<string, CodeEvidenceEntry> = {};
  for (const [key, value] of Object.entries(byOpenRaw)) {
    const entry = parseEntry(value);
    if (entry) by_open_code[key] = entry;
  }

  return {
    version: typeof o.version === "number" ? o.version : 1,
    slug: typeof o.slug === "string" ? o.slug : "",
    research_question: typeof o.research_question === "string" ? o.research_question : undefined,
    generated_at: typeof o.generated_at === "string" ? o.generated_at : undefined,
    by_open_code,
  };
}

export function lookupCodeEvidence(
  byOpenCode: Record<string, CodeEvidenceEntry>,
  codeLabel: string
): CodeEvidenceEntry | null {
  const key = codeLabel.trim();
  if (!key) return null;
  return byOpenCode[key] ?? null;
}

export function formatEvidenceSourceLine(snippet: CodeEvidenceSnippet): string {
  const review = `Review ${snippet.review_id}`;
  return snippet.source_id ? `${review} · ${snippet.source_id}` : review;
}
