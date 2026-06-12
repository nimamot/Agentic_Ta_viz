import { useCallback, useMemo, useState } from "react";
import {
  buildApproveSubmitPayload,
  type CodebookPayload,
  type CodebookReviewRow,
} from "../lib/codebookReview";

type JsonTab = "v2" | "submit" | "v1" | "inputs";

interface CodebookReviewJsonPanelProps {
  review: CodebookReviewRow;
  codebook: CodebookPayload;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CodebookReviewJsonPanel({ review, codebook }: CodebookReviewJsonPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<JsonTab>("v2");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const submitPreview = useMemo(() => buildApproveSubmitPayload(codebook), [codebook]);

  const tabContent = useMemo(() => {
    switch (tab) {
      case "v2":
        return { label: "codebook_v2 (draft)", data: codebook, live: true };
      case "submit":
        return {
          label: "Submit payload (PATCH body)",
          data: submitPreview,
          live: true,
        };
      case "v1":
        return { label: "codebook_v1 (original, read-only)", data: review.codebook_v1, live: false };
      case "inputs":
        return {
          label: "Pipeline inputs (read-only)",
          data: {
            clustered_codes: review.clustered_codes,
            codebook_confidence: review.codebook_confidence,
          },
          live: false,
        };
    }
  }, [tab, codebook, submitPreview, review]);

  const jsonText = useMemo(() => formatJson(tabContent.data), [tabContent.data]);

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
          1 DB row · edits update <code>codebook_v2</code> live · {open ? "hide" : "show"}
        </span>
      </button>

      {open && (
        <div className="codebook-json-panel-body">
          <p className="codebook-json-explainer">
            The pipeline uploads <strong>one row</strong> in <code>codebook_reviews</code> with separate JSON
            columns on load. Your edits build a single draft object —{" "}
            <code>codebook_v2</code> — which is the only JSON written back on Approve.{" "}
            <code>codebook_v1</code>, <code>clustered_codes</code>, and <code>codebook_confidence</code> stay
            unchanged.
          </p>

          <div className="codebook-json-tabs" role="tablist">
            {(
              [
                ["v2", "Draft (v2)"],
                ["submit", "Submit preview"],
                ["v1", "Original (v1)"],
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
                {(id === "v2" || id === "submit") && <span className="codebook-json-live-dot" title="Live" />}
              </button>
            ))}
          </div>

          <div className="codebook-json-toolbar">
            <span className="codebook-json-filename">{tabContent.label}</span>
            {tabContent.live && <span className="library-chip">updates as you edit</span>}
            <button type="button" className="library-mini-btn" onClick={() => void copyJson()}>
              {copyMsg ?? "Copy JSON"}
            </button>
          </div>

          <pre className="codebook-json-pre" key={`${tab}-${jsonText.length}`}>
            {jsonText}
          </pre>
        </div>
      )}
    </div>
  );
}
