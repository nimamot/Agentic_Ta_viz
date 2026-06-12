import { useCallback, useMemo, useState } from "react";
import {
  buildApproveSubmitPayload,
  type CodebookPayload,
  type CodebookReviewRow,
} from "../lib/codebookReview";
import { formatJsonStable } from "../lib/jsonLineDiff";
import { CodebookJsonDiff, getDiffCopyText } from "./CodebookJsonDiff";

type JsonTab = "diff" | "v2" | "submit" | "inputs";

interface CodebookReviewJsonPanelProps {
  review: CodebookReviewRow;
  codebook: CodebookPayload;
  /** Snapshot of the draft right after this review was opened — diff baseline for edits. */
  baselineCodebook: CodebookPayload;
}

export function CodebookReviewJsonPanel({
  review,
  codebook,
  baselineCodebook,
}: CodebookReviewJsonPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<JsonTab>("diff");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const submitPreview = useMemo(() => buildApproveSubmitPayload(codebook), [codebook]);

  const tabContent = useMemo(() => {
    switch (tab) {
      case "diff":
        return { label: "Your edits (baseline → current v2)", live: true, isDiff: true as const };
      case "v2":
        return { label: "codebook_v2 (draft)", data: codebook, live: true, isDiff: false as const };
      case "submit":
        return {
          label: "Submit payload (PATCH body)",
          data: submitPreview,
          live: true,
          isDiff: false as const,
        };
      case "inputs":
        return {
          label: "Pipeline inputs (read-only)",
          data: {
            clustered_codes: review.clustered_codes,
            codebook_confidence: review.codebook_confidence,
          },
          live: false,
          isDiff: false as const,
        };
    }
  }, [tab, codebook, submitPreview, review]);

  const jsonText = useMemo(() => {
    if (tabContent.isDiff) return getDiffCopyText(baselineCodebook, codebook);
    return formatJsonStable(tabContent.data);
  }, [tabContent, baselineCodebook, codebook]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopyMsg("Copied");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  }, [jsonText]);

  return (
    <div className="codebook-json-panel glass-panel">
      <button
        type="button"
        className="codebook-json-panel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="codebook-json-panel-toggle-title">JSON payload</span>
        <span className="library-panel-sub">
          1 DB row · compare v1 vs your draft · {open ? "hide" : "show"}
        </span>
      </button>

      {open && (
        <div className="codebook-json-panel-body">
          <p className="codebook-json-explainer">
            Compares your <strong>starting draft</strong> (built from <code>codebook_v1</code> when you opened this
            review) with your <strong>current draft</strong> (<code>codebook_v2</code>). Removals are{" "}
            <span className="codebook-json-diff-legend-remove">red</span>, additions{" "}
            <span className="codebook-json-diff-legend-add">green</span> — like git. Unchanged on load means no false
            highlights from JSON key order. Approve writes only <code>codebook_v2</code>.
          </p>

          <div className="codebook-json-tabs" role="tablist">
            {(
              [
                ["diff", "Compare (v1 → v2)"],
                ["v2", "Draft (v2)"],
                ["submit", "Submit preview"],
                ["inputs", "Pipeline inputs"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`codebook-json-tab ${tab === id ? "codebook-json-tab--active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
                {(id === "diff" || id === "v2" || id === "submit") && (
                  <span className="codebook-json-live-dot" title="Live" />
                )}
              </button>
            ))}
          </div>

          <div className="codebook-json-toolbar">
            <span className="codebook-json-filename">{tabContent.label}</span>
            {tabContent.live && <span className="library-chip">updates as you edit</span>}
            <button type="button" className="library-mini-btn" onClick={() => void copyJson()}>
              {copyMsg ?? (tab === "diff" ? "Copy patch" : "Copy JSON")}
            </button>
          </div>

          {tab === "diff" ? (
            <CodebookJsonDiff original={baselineCodebook} draft={codebook} />
          ) : (
            <pre className="codebook-json-pre" key={`${tab}-${jsonText.length}`}>
              {jsonText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
