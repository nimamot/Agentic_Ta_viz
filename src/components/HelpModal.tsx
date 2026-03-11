interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
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
              <li><kbd>/</kbd> Focus node search</li>
              <li><kbd>Esc</kbd> Clear selection</li>
              <li><kbd>?</kbd> This help</li>
              <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> Build graph from JSON</li>
            </ul>
          </section>
          <section>
            <h3>Views</h3>
            <p><strong>Overview</strong> shows the full graph with optional cluster colors and reduced labels. <strong>Focus</strong> shows only the selected node and its 1- or 2-hop neighborhood for a clearer read.</p>
          </section>
          <section>
            <h3>Export</h3>
            <p>Use &quot;Export PNG&quot; in the header to download the current graph view as an image.</p>
          </section>
          <section>
            <h3>URL</h3>
            <p>View and selected node are stored in the URL hash so you can bookmark or share a specific state.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
