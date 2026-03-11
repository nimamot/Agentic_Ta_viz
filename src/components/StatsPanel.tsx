interface StatsPanelProps {
  nodeCount: number;
  edgeCount: number;
  componentCount: number;
  density: number;
  maxDegree: number;
  directEdges: number;
  inferredEdges: number;
  visibleNodes?: number;
  visibleEdges?: number;
  viewMode: string;
}

export function StatsPanel({
  nodeCount,
  edgeCount,
  componentCount,
  density,
  maxDegree,
  directEdges,
  inferredEdges,
  visibleNodes,
  visibleEdges,
  viewMode,
}: StatsPanelProps) {
  return (
    <div className="stats-panel">
      <div className="stats-title">Graph stats</div>
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-value">{viewMode === "focus" && visibleNodes != null ? visibleNodes : nodeCount}</span>
          <span className="stat-label">nodes</span>
        </div>
        <div className="stat">
          <span className="stat-value">{viewMode === "focus" && visibleEdges != null ? visibleEdges : edgeCount}</span>
          <span className="stat-label">edges</span>
        </div>
        <div className="stat">
          <span className="stat-value">{componentCount}</span>
          <span className="stat-label">components</span>
        </div>
        <div className="stat">
          <span className="stat-value">{density}</span>
          <span className="stat-label">density</span>
        </div>
        <div className="stat">
          <span className="stat-value">{maxDegree}</span>
          <span className="stat-label">max degree</span>
        </div>
        <div className="stat">
          <span className="stat-value">{directEdges} / {inferredEdges}</span>
          <span className="stat-label">direct / inferred</span>
        </div>
      </div>
    </div>
  );
}
