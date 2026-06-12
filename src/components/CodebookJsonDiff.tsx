import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildSplitDiffRows,
  buildUnifiedDiffLines,
  buildUnifiedPatch,
  computeDiffStats,
  formatJsonForDiff,
  type DiffLine,
} from "../lib/jsonLineDiff";

type DiffView = "split" | "unified";

interface CodebookJsonDiffProps {
  original: unknown;
  draft: unknown;
}

function gutterPrefix(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "remove") return "−";
  return " ";
}

function DiffLineCell({ line }: { line: DiffLine }) {
  const type = line.type === "empty" ? "gap" : line.type;
  return (
    <div className={`codebook-json-diff-cell codebook-json-diff-cell--${type}`}>
      <span className="codebook-json-diff-ln" aria-hidden />
      <code className="codebook-json-diff-code">{line.text || (type === "gap" ? "" : " ")}</code>
    </div>
  );
}

export function CodebookJsonDiff({ original, draft }: CodebookJsonDiffProps) {
  const [view, setView] = useState<DiffView>("split");
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const syncLock = useRef(false);

  const syncPaneScroll = useCallback((source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncLock.current) return;
    syncLock.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      syncLock.current = false;
    });
  }, []);

  const v1Text = useMemo(() => formatJsonForDiff(original), [original]);
  const v2Text = useMemo(() => formatJsonForDiff(draft), [draft]);
  const stats = useMemo(() => computeDiffStats(v1Text, v2Text), [v1Text, v2Text]);
  const unifiedLines = useMemo(() => buildUnifiedDiffLines(v1Text, v2Text), [v1Text, v2Text]);
  const splitRows = useMemo(() => buildSplitDiffRows(v1Text, v2Text), [v1Text, v2Text]);

  return (
    <div className="codebook-json-diff">
      <div className="codebook-json-diff-meta">
        <div className="codebook-json-diff-stats">
          {stats.unchanged ? (
            <span className="codebook-json-diff-unchanged">No edits yet</span>
          ) : (
            <>
              <span className="codebook-json-diff-stat codebook-json-diff-stat--add">+{stats.added} lines</span>
              <span className="codebook-json-diff-stat codebook-json-diff-stat--remove">−{stats.removed} lines</span>
            </>
          )}
        </div>
        <div className="codebook-json-diff-views" role="tablist" aria-label="Diff layout">
          <button
            type="button"
            role="tab"
            aria-selected={view === "split"}
            className={`codebook-json-diff-view-btn ${view === "split" ? "codebook-json-diff-view-btn--active" : ""}`}
            onClick={() => setView("split")}
          >
            Side by side
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "unified"}
            className={`codebook-json-diff-view-btn ${view === "unified" ? "codebook-json-diff-view-btn--active" : ""}`}
            onClick={() => setView("unified")}
          >
            Unified
          </button>
        </div>
      </div>

      {view === "split" ? (
        <div className="codebook-json-diff-split">
          <div className="codebook-json-diff-pane">
            <div className="codebook-json-diff-pane-head codebook-json-diff-pane-head--v1">
              Baseline (when you opened)
            </div>
            <div
              ref={leftPaneRef}
              className="codebook-json-diff-pane-body"
              onScroll={(e) => syncPaneScroll(e.currentTarget, rightPaneRef.current)}
            >
              {splitRows.map((row, i) => (
                <DiffLineCell key={`l-${i}`} line={row.left} />
              ))}
            </div>
          </div>
          <div className="codebook-json-diff-pane">
            <div className="codebook-json-diff-pane-head codebook-json-diff-pane-head--v2">
              Current draft (v2)
            </div>
            <div
              ref={rightPaneRef}
              className="codebook-json-diff-pane-body"
              onScroll={(e) => syncPaneScroll(e.currentTarget, leftPaneRef.current)}
            >
              {splitRows.map((row, i) => (
                <DiffLineCell key={`r-${i}`} line={row.right} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="codebook-json-diff-unified">
          {unifiedLines.map((line, i) => (
            <div
              key={i}
              className={`codebook-json-diff-line codebook-json-diff-line--${line.type}`}
            >
              <span className="codebook-json-diff-gutter">{gutterPrefix(line.type)}</span>
              <code className="codebook-json-diff-code">{line.text || " "}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function getDiffCopyText(original: unknown, draft: unknown): string {
  return buildUnifiedPatch(
    formatJsonForDiff(original),
    formatJsonForDiff(draft),
    "codebook_v2-baseline → codebook_v2"
  );
}
