import {
  formatEvidenceSourceLine,
  lookupCodeEvidence,
  type CodeEvidenceEntry,
} from "../lib/codeEvidence";

interface CodeEvidenceHoverPanelProps {
  codeLabel: string;
  byOpenCode: Record<string, CodeEvidenceEntry>;
  clusterColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CodeEvidenceHoverPanel({
  codeLabel,
  byOpenCode,
  clusterColor,
  className = "codebook-node-hover-panel",
  style,
}: CodeEvidenceHoverPanelProps) {
  const entry = lookupCodeEvidence(byOpenCode, codeLabel);
  const primary = entry?.primary ?? null;
  const hasEvidence = primary != null;
  const note = primary?.note?.trim() ?? "";
  const quoteCount = entry?.quote_count ?? 0;
  const reviewCount = entry?.review_count ?? 0;
  const moreQuotes = quoteCount > 1 ? quoteCount - 1 : 0;

  return (
    <div
      className={className}
      style={{
        ...(clusterColor ? { ["--cluster-color" as string]: clusterColor } : {}),
        ...style,
      }}
    >
      <div className="code-evidence-hover-code">{codeLabel}</div>
      {hasEvidence ? (
        <>
          <blockquote className="code-evidence-hover-quote">&ldquo;{primary.quote}&rdquo;</blockquote>
          <div className="code-evidence-hover-source">{formatEvidenceSourceLine(primary)}</div>
          {note ? <div className="code-evidence-hover-note">Note: {note}</div> : null}
          {quoteCount > 0 || reviewCount > 0 ? (
            <div className="code-evidence-hover-stats">
              {quoteCount} {quoteCount === 1 ? "quote" : "quotes"} · {reviewCount}{" "}
              {reviewCount === 1 ? "review" : "reviews"}
            </div>
          ) : null}
          {moreQuotes > 0 ? (
            <div className="code-evidence-hover-more">
              +{moreQuotes} more {moreQuotes === 1 ? "quote" : "quotes"} in {reviewCount}{" "}
              {reviewCount === 1 ? "review" : "reviews"}
            </div>
          ) : null}
        </>
      ) : (
        <div className="code-evidence-hover-empty">No grounded quotes indexed for this code</div>
      )}
    </div>
  );
}
