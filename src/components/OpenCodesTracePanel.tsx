import type { GraphNode } from "../types";
import type { OpenCodeEvidenceRow } from "../lib/openCodesEvidence";

export type TraceEvidenceGroup = {
  leaf: GraphNode;
  rows: OpenCodeEvidenceRow[];
};

type OpenCodesTracePanelProps = {
  selectedNode: GraphNode | null;
  markdownAvailable: boolean;
  /** Theme tree or any graph whose nodes carry hierarchyRole (corpus restricted to code nodes). */
  treeMode: boolean;
  /** When treeMode: only open-code nodes may show corpus content. */
  traceEligible: boolean;
  /** Immediate parent label when a code node is selected (tree). */
  directParentLabel: string | null;
  evidenceGroups: TraceEvidenceGroup[];
};

export function OpenCodesTracePanel({
  selectedNode,
  markdownAvailable,
  treeMode,
  traceEligible,
  directParentLabel,
  evidenceGroups,
}: OpenCodesTracePanelProps) {
  const showCorpus =
    selectedNode &&
    markdownAvailable &&
    (!treeMode || traceEligible);

  return (
    <section className="library-trace-panel" aria-label="Open codes corpus traceability">
      <div className="library-trace-head">
        <span className="library-trace-icon">◇</span>
        <h4 className="library-trace-title">Open codes · corpus evidence</h4>
      </div>
      <div className="library-trace-body">
        {!selectedNode && (
          <p className="library-trace-empty">Click a node in the graph to select it.</p>
        )}
        {selectedNode && !markdownAvailable && (
          <p className="library-trace-empty">
            No <code className="library-inline-code">open_codes_markdown</code> field for this row. Add corpus text in the database to
            enable traceability.
          </p>
        )}
        {selectedNode && markdownAvailable && treeMode && !traceEligible && (
          <p className="library-trace-empty">
            Corpus traceability is only shown for <strong>open code</strong> nodes (leaves in the tree). Select a code to see review
            evidence; theme and sub-theme nodes keep this panel empty.
          </p>
        )}
        {showCorpus && (
          <>
            <div className="library-trace-node">
              <span className="library-trace-node-label">{selectedNode.label}</span>
              {treeMode && traceEligible && (
                <span
                  className="library-trace-badge"
                  title={selectedNode.hierarchyRole === "code" ? "Open code" : "Leaf code (corpus)"}
                >
                  {selectedNode.hierarchyRole === "code" ? "code" : "leaf"}
                </span>
              )}
              {treeMode && traceEligible && directParentLabel && (
                <span className="library-trace-parent-hint" title="Direct parent in the tree">
                  Parent: <strong>{directParentLabel}</strong>
                </span>
              )}
              {!treeMode && (
                <span className="library-trace-badge library-trace-badge--graph" title="Graph node">
                  node
                </span>
              )}
            </div>
            {evidenceGroups.length === 0 ? (
              <p className="library-trace-empty">
                No matching <strong>- Code:</strong> lines in the corpus for this label.
              </p>
            ) : (
              <ul className="library-trace-groups library-trace-groups--single">
                {evidenceGroups.map(({ leaf, rows }) => (
                  <li key={leaf.id} className="library-trace-group">
                    {rows.length === 0 ? (
                      <p className="library-trace-empty library-trace-empty--inset">
                        No matching <strong>- Code:</strong> lines in the corpus for this label.
                      </p>
                    ) : (
                      <ul className="library-trace-list">
                        {rows.map((row, i) => (
                          <li
                            key={`${leaf.id}-${row.reviewSection}-${i}-${row.evidence.slice(0, 20)}`}
                            className="library-trace-item"
                          >
                            <div className="library-trace-meta">{row.reviewSection}</div>
                            {row.evidence ? (
                              <blockquote className="library-trace-evidence">{stripOuterQuotes(row.evidence)}</blockquote>
                            ) : null}
                            {row.note ? <p className="library-trace-note">{row.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}
