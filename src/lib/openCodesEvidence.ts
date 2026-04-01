/**
 * Parses corpus markdown shaped like:
 * ## Review N
 * - Code: some label
 *   Evidence: "quote"
 *   Note: rationale
 */

export type OpenCodeEvidenceRow = {
  /** Heading line after ##, e.g. "Review 12" */
  reviewSection: string;
  code: string;
  evidence: string;
  note: string;
};

export function normalizeCodeLabel(label: string): string {
  return label
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function codesMatch(graphLabel: string, corpusCode: string): boolean {
  const g = normalizeCodeLabel(graphLabel);
  const c = normalizeCodeLabel(corpusCode);
  if (!g || !c) return false;
  if (g === c) return true;
  if (g.length < 4 || c.length < 4) return false;
  return g.includes(c) || c.includes(g);
}

function parseReviewSectionBody(body: string, reviewHeading: string): OpenCodeEvidenceRow[] {
  const rows: OpenCodeEvidenceRow[] = [];
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const codeMatch = lines[i].match(/^-\s*Code:\s*(.+)$/);
    if (!codeMatch) {
      i++;
      continue;
    }
    const codeRaw = codeMatch[1].trim();
    i++;
    let evidence = "";
    let note = "";
    while (i < lines.length && !/^-\s*Code:/.test(lines[i])) {
      const ev = lines[i].match(/^\s*Evidence:\s*(.*)$/);
      const nt = lines[i].match(/^\s*Note:\s*(.*)$/);
      if (ev) evidence = ev[1].trim();
      else if (nt) note = nt[1].trim();
      i++;
    }
    rows.push({
      reviewSection: reviewHeading,
      code: codeRaw,
      evidence,
      note,
    });
  }
  return rows;
}

/**
 * Returns every corpus row whose code matches the graph node label (exact normalized match,
 * then substring match for minor wording differences).
 */
export function extractEvidenceForCode(
  markdown: string | null | undefined,
  codeLabel: string
): OpenCodeEvidenceRow[] {
  if (!markdown?.trim() || !codeLabel.trim()) return [];

  const all: OpenCodeEvidenceRow[] = [];
  const sections = markdown.split(/^##\s+/gm);
  for (const sec of sections) {
    if (!sec.trim()) continue;
    const nl = sec.indexOf("\n");
    const heading = (nl === -1 ? sec : sec.slice(0, nl)).trim();
    const body = nl === -1 ? "" : sec.slice(nl + 1);
    for (const row of parseReviewSectionBody(body, heading)) {
      if (codesMatch(codeLabel, row.code)) {
        all.push(row);
      }
    }
  }
  return all;
}

