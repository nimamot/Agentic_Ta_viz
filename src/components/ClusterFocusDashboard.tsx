import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { HighlightedCode } from "./codebookClusterTypes";
import type { ClusterEntry } from "../lib/codebookReview";

interface ClusterFocusDashboardProps {
  clusterId: string;
  entry: ClusterEntry;
  codes: string[];
  color: string;
  highlighted: HighlightedCode | null;
  sortedClusterIds: string[];
  clusters: Record<string, ClusterEntry>;
  clusterColor: Map<string, string>;
  onSelectCode: (code: string, clusterId: string) => void;
  onRequestMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  removingCode?: string | null;
  onBack: () => void;
  panelStyle?: CSSProperties;
}

interface MoveTargetCluster {
  id: string;
  label: string;
  color: string;
}

function truncateLabel(text: string, max = 48): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function FocusCodeMoveMenu({
  code,
  targets,
  onMove,
}: {
  code: string;
  targets: MoveTargetCluster[];
  onMove: (toClusterId: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const openMenu = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.top, right: window.innerWidth - rect.right + 2 });
    }
    setOpen(true);
  };

  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setSubOpen(false);
    }, 130);
  };

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  if (targets.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="codebook-focus-code-menu-trigger"
        aria-label={`Actions for ${code}`}
        aria-expanded={open}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onClick={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="3.25" r="1.35" fill="currentColor" />
          <circle cx="8" cy="8" r="1.35" fill="currentColor" />
          <circle cx="8" cy="12.75" r="1.35" fill="currentColor" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="codebook-focus-code-menu-popover"
            style={{ top: pos.top, right: pos.right }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div
              className="codebook-focus-code-menu-item"
              onMouseEnter={() => setSubOpen(true)}
              onMouseLeave={() => setSubOpen(false)}
            >
              <span>Move code</span>
              <span className="codebook-focus-code-menu-chevron" aria-hidden="true">
                ‹
              </span>
              {subOpen && (
                <div className="codebook-focus-code-submenu">
                  {targets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className="codebook-focus-code-submenu-item"
                      style={{ ["--target-color" as string]: target.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        setSubOpen(false);
                        onMove(target.id);
                      }}
                    >
                      <span className="codebook-focus-code-submenu-label">
                        {truncateLabel(target.label || `Cluster ${target.id}`, 56)}
                      </span>
                      <span className="codebook-focus-code-submenu-meta">#{target.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Fixed screen-space title above the 3D pane — does not orbit with the graph. */
export function FocusClusterScreenLabel({
  clusterId,
  entry,
  codeCount,
  color,
  visible,
}: {
  clusterId: string;
  entry: ClusterEntry;
  codeCount: number;
  color: string;
  visible: boolean;
}) {
  return (
    <div
      className={`codebook-3d-focus-screen-label ${visible ? "codebook-3d-focus-screen-label--visible" : ""}`}
      style={{ ["--cluster-color" as string]: color }}
      aria-hidden={!visible}
    >
      <div className="codebook-3d-label codebook-3d-label--cluster codebook-3d-label--focus">
        <span className="codebook-3d-label-name">{entry.label || `Cluster ${clusterId}`}</span>
        <span className="codebook-3d-label-meta">
          #{clusterId} · {entry.confidence}/5 · {codeCount} code{codeCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

export function ClusterFocusDashboard({
  clusterId,
  entry,
  codes,
  color,
  highlighted,
  sortedClusterIds,
  clusters,
  clusterColor,
  onSelectCode,
  onRequestMoveCode,
  removingCode = null,
  onBack,
  panelStyle,
}: ClusterFocusDashboardProps) {
  const moveTargets = useMemo((): MoveTargetCluster[] => {
    return sortedClusterIds
      .filter((id) => id !== clusterId && clusters[id]?.status !== "drop")
      .map((id) => ({
        id,
        label: clusters[id]?.label || `Cluster ${id}`,
        color: clusterColor.get(id) ?? "#7cf0d0",
      }));
  }, [sortedClusterIds, clusterId, clusters, clusterColor]);

  const handleMoveCode = (code: string, toClusterId: string) => {
    onRequestMoveCode?.(code, clusterId, toClusterId);
  };

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
        <span className="library-panel-sub">
          {onRequestMoveCode ? "Click to highlight · ⋮ to move" : "Click to highlight in the map"}
        </span>
      </div>

      <ul className="codebook-3d-focus-code-list">
        {codes.map((code, index) => {
          const isActive = highlighted?.code === code && highlighted.clusterId === clusterId;
          const isRemoving = removingCode === code;
          return (
            <li
              key={code}
              className={`codebook-3d-focus-code-row ${isRemoving ? "codebook-3d-focus-code-row--removing" : ""}`}
            >
              <button
                type="button"
                className={`codebook-3d-focus-code-item ${isActive ? "codebook-3d-focus-code-item--active" : ""}`}
                onClick={() => onSelectCode(code, clusterId)}
              >
                <span className="codebook-3d-focus-code-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="codebook-3d-focus-code-text">{code}</span>
              </button>
              {onRequestMoveCode && (
                <FocusCodeMoveMenu
                  code={code}
                  targets={moveTargets}
                  onMove={(toClusterId) => handleMoveCode(code, toClusterId)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
