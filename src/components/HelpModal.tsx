interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Help">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shortcuts &amp; tips</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>Keyboard</h3>
            <ul>
              <li>
                <kbd>Esc</kbd> Clear selected research row
              </li>
              <li>
                <kbd>?</kbd> This help
              </li>
            </ul>
          </section>
          <section>
            <h3>Library</h3>
            <p>
              Fetch rows from Supabase (env: <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, optional{" "}
              <code>VITE_SUPABASE_TABLE</code>). Each row can include hierarchical <code>codebook</code> JSON, edge-based{" "}
              <code>global_graph</code> JSON, and <code>report_markdown</code>.
            </p>
            <p>
              Open the <strong>Global graph</strong> panel to explore trees (radial flower layout) or edge graphs. Use{" "}
              <strong>Export</strong> in that panel to save a PNG.
            </p>
          </section>
          <section>
            <h3>URL</h3>
            <p>
              The address hash keeps <code>page=library</code> and, when a project is selected, <code>row=&lt;id&gt;</code>. Use{" "}
              <strong>Copy link to graph</strong> in the Library toolbar to share that URL; opening it switches to Library and
              selects that project.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
