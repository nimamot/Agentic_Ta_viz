import type { CSSProperties } from "react";
import type { HighlightedCode } from "./codebookClusterTypes";
import type { ClusterEntry } from "../lib/codebookReview";

interface ClusterFocusDashboardProps {
  clusterId: string;
  entry: ClusterEntry;
  codes: string[];
  color: string;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onBack: () => void;
  panelStyle?: CSSProperties;
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function ClusterFocusDashboard({
  clusterId,
  entry,
  codes,
  color,
  highlighted,
  onSelectCode,
  onBack,
  panelStyle,
}: ClusterFocusDashboardProps) {
  return (
    <aside
      className="codebook-3d-focus-dashboard"
      style={{ ["--cluster-color" as string]: color, ...panelStyle }}
    >
      <div className="codebook-3d-focus-dashboard-head">
        <button type="button" className="library-mini-btn codebook-3d-focus-back" onClick={onBack}>
          ← All clusters
        </button>
        <div className="codebook-3d-focus-dashboard-title-block">
          <h3 className="codebook-3d-focus-dashboard-title">{entry.label || `Cluster ${clusterId}`}</h3>
          <p className="codebook-3d-focus-dashboard-meta">
            #{clusterId} · confidence {entry.confidence}/5 · {codes.length} code{codes.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {entry.description?.trim() && (
        <p className="codebook-3d-focus-dashboard-desc">{truncate(entry.description, 280)}</p>
      )}

      <div className="codebook-3d-focus-dashboard-stats">
        <span className={`codebook-3d-focus-stat codebook-3d-focus-stat--${entry.status}`}>
          {entry.status === "keep" ? "Active" : "Dropped"}
        </span>
        <span className="codebook-3d-focus-stat">{entry.source}</span>
        {entry.needs_more_evidence && (
          <span className="codebook-3d-focus-stat codebook-3d-focus-stat--warn">Needs evidence</span>
        )}
      </div>

      <div className="codebook-3d-focus-codes-head">
        <h4>Codes in cluster</h4>
        <span className="library-panel-sub">Click to highlight in the map</span>
      </div>

      <ul className="codebook-3d-focus-code-list">
        {codes.map((code, index) => {
          const isActive = highlighted?.code === code && highlighted.clusterId === clusterId;
          return (
            <li key={code}>
              <button
                type="button"
                className={`codebook-3d-focus-code-item ${isActive ? "codebook-3d-focus-code-item--active" : ""}`}
                onClick={() => onSelectCode(code, clusterId)}
              >
                <span className="codebook-3d-focus-code-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="codebook-3d-focus-code-text">{code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
