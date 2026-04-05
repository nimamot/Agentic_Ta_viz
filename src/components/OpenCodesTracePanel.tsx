import type { GraphNode } from "../types";
import type { OpenCodeEvidenceRow } from "../lib/openCodesEvidence";

export type TraceEvidenceGroup = {
  leaf: GraphNode;
  rows: OpenCodeEvidenceRow[];
};

export type TraceEvidenceMeta = {
  truncated: boolean;
  totalLeaves: number;
  shownCount: number;
};

type OpenCodesTracePanelProps = {
  selectedNode: GraphNode | null;
  markdownAvailable: boolean;
  /** Theme tree or any graph whose nodes carry hierarchyRole (corpus restricted to code nodes). */
  treeMode: boolean;
  /** When treeMode: node can show corpus (leaf, theme, sub-theme, or branch with descendants). */
  traceEligible: boolean;
  /** Immediate parent label when a code leaf is selected (tree). */
  directParentLabel: string | null;
  evidenceGroups: TraceEvidenceGroup[];
  /** Set for hierarchical graphs: descendant leaf counts and top-10 cap. */
  evidenceMeta?: TraceEvidenceMeta | null;
};

function traceScopeSummary(meta: TraceEvidenceMeta | null | undefined): string | null {
  if (!meta) return null;
  if (meta.totalLeaves <= 1 && !meta.truncated) return null;
  if (meta.truncated) {
    return `Corpus evidence for up to ${meta.shownCount} descendant codes (${meta.shownCount} of ${meta.totalLeaves} — cap).`;
  }
  return `Corpus evidence from ${meta.totalLeaves} descendant codes.`;
}

function treeNodeBadge(node: GraphNode): { label: string; title: string } {
  const r = node.hierarchyRole;
  if (r === "code") return { label: "code", title: "Open code" };
  if (r === "theme") return { label: "theme", title: "Theme" };
  if (r === "sub_theme") return { label: "sub-theme", title: "Sub-theme" };
  return { label: "branch", title: "Branch node" };
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** One corpus row: quote and note first; review + code label as footer. */
function CorpusEvidenceCard({
  leaf,
  row,
}: {
  leaf: GraphNode;
  row: OpenCodeEvidenceRow;
}) {
  const quote = row.evidence ? stripOuterQuotes(row.evidence).trim() : "";
  const codeLine = row.code.trim() || leaf.label;

  return (
    <li className="library-trace-item library-trace-item--evidence-first">
      {quote ? <blockquote className="library-trace-evidence">{quote}</blockquote> : null}
      {row.note ? <p className="library-trace-note">{row.note}</p> : null}
      {!quote && !row.note ? (
        <p className="library-trace-empty library-trace-empty--inset">
          Corpus row matched this code but has no <strong>Evidence</strong> or <strong>Note</strong> text.
        </p>
      ) : null}
      <div className="library-trace-attribution" aria-label="Review and code">
        <span className="library-trace-attribution-review">{row.reviewSection}</span>
        <span className="library-trace-attribution-sep" aria-hidden="true">
          ·
        </span>
        <span className="library-trace-attribution-code" title={leaf.title}>
          {codeLine}
        </span>
      </div>
    </li>
  );
}

export function OpenCodesTracePanel({
  selectedNode,
  markdownAvailable,
  treeMode,
  traceEligible,
  directParentLabel,
  evidenceGroups,
  evidenceMeta = null,
}: OpenCodesTracePanelProps) {
  const showCorpus =
    selectedNode &&
    markdownAvailable &&
    (!treeMode || traceEligible);

  const scopeLine = traceScopeSummary(evidenceMeta);
  const noDescendantLeaves =
    Boolean(evidenceMeta && evidenceMeta.totalLeaves === 0 && evidenceGroups.length === 0);
  const treeBadge =
    selectedNode && treeMode && traceEligible ? treeNodeBadge(selectedNode) : null;

  const streamItems = evidenceGroups.flatMap(({ leaf, rows }) => {
    if (rows.length === 0) {
      return [
        <li key={`miss-${leaf.id}`} className="library-trace-item library-trace-item--missing">
          <p className="library-trace-missing-copy">
            No matching <strong>- Code:</strong> lines in the corpus for{" "}
            <strong>{leaf.label}</strong>.
          </p>
        </li>,
      ];
    }
    return rows.map((row, i) => (
      <CorpusEvidenceCard
        key={`${leaf.id}-${row.reviewSection}-${i}-${row.evidence.slice(0, 24)}`}
        leaf={leaf}
        row={row}
      />
    ));
  });

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
            Corpus traceability is not available for this node in the current graph view.
          </p>
        )}
        {showCorpus && (
          <>
            <div className="library-trace-node">
              <span className="library-trace-node-label">{selectedNode.label}</span>
              {treeBadge ? (
                <span className="library-trace-badge" title={treeBadge.title}>
                  {treeBadge.label}
                </span>
              ) : null}
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
            {scopeLine ? <p className="library-trace-scope-line">{scopeLine}</p> : null}
            {noDescendantLeaves ? (
              <p className="library-trace-empty">No open-code descendants under this node.</p>
            ) : evidenceGroups.length === 0 ? (
              <p className="library-trace-empty">
                No matching <strong>- Code:</strong> lines in the corpus for this label.
              </p>
            ) : (
              <ul className="library-trace-list library-trace-list--stream">{streamItems}</ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
