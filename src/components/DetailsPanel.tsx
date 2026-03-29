import type { GraphData } from "../types";

interface DetailsPanelProps {
  data: GraphData | null;
  selectedNodeId: number | null;
  viewMode: string;
  renderedNodeCount: number;
  renderedDepth: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function DetailsPanel({
  data,
  selectedNodeId,
  viewMode,
  renderedNodeCount,
  renderedDepth,
}: DetailsPanelProps) {
  if (!data || selectedNodeId == null || !data.nodeMap.has(selectedNodeId)) {
    return (
      <div className="details-panel">
        <div className="empty-state">
          Build a graph to inspect clusters, then click a node or use the search box to open a clearer focus view.
        </div>
      </div>
    );
  }

  const node = data.nodeMap.get(selectedNodeId)!;
  const incoming = Array.from(data.adjacency.incoming.get(node.id) ?? [])
    .map((id) => data.nodeMap.get(id)!.label)
    .sort();
  const outgoing = Array.from(data.adjacency.outgoing.get(node.id) ?? [])
    .map((id) => data.nodeMap.get(id)!.label)
    .sort();
  const aliases = (node.aliases ?? []).filter((a) => a !== node.label);
  const modeText =
    viewMode === "focus"
      ? `Showing ${renderedNodeCount} nodes across a ${renderedDepth}-hop neighborhood.`
      : viewMode === "hierarchy"
        ? "Hierarchical view: theme → sub-theme → code (ungrouped codes attach directly to the theme)."
        : "Overview selection highlighted inside the full graph.";

  const Chips = ({ values }: { values: string[] }) =>
    values.length === 0 ? (
      <div className="empty-state">None</div>
    ) : (
      <div className="chip-list">
        {values.map((value) => (
          <span key={value} className="chip">
            {escapeHtml(value)}
          </span>
        ))}
      </div>
    );

  return (
    <div className="details-panel">
      <h2>{escapeHtml(node.label)}</h2>
      <div className="meta">
        Degree {node.degree} · {node.outDegree} out · {node.inDegree} in · freq {node.frequency}
      </div>
      <div className="meta">{modeText}</div>
      <div className="section">
        <div className="section-title">Aliases</div>
        <Chips values={aliases} />
      </div>
      <div className="section">
        <div className="section-title">Parents</div>
        <Chips values={incoming} />
      </div>
      <div className="section">
        <div className="section-title">Children</div>
        <Chips values={outgoing} />
      </div>
      {node.provenance.length > 0 && (
        <div className="section">
          <div className="section-title">Raw codes ({node.provenance.length})</div>
          <Chips values={node.provenance} />
        </div>
      )}
    </div>
  );
}
