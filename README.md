# Thematic Codebook Graph

A simple web app that turns a thematic analysis codebook (JSON) into an interactive force-directed graph.

## How to use

1. Open `index.html` in a browser (or run a local server from this folder).
2. Paste your codebook JSON into the text area. The JSON should include:
   - **canonical_nodes** (optional): list of main theme labels.
   - **merge_groups** (optional): arrays of labels that are treated as the same theme (one node per group).
   - **edges**: array of `{ "parent": "...", "child": "..." }` for direct relationships.
   - **inferred_edges** (optional): same structure for inferred relationships (shown with dashed lines).
3. Click **Build graph** (or Ctrl/Cmd + Enter).
4. Use the checkbox to show or hide inferred edges.
5. Drag nodes, zoom, and pan to explore the graph; hover for labels.

## Example JSON shape

```json
{
  "canonical_nodes": ["Theme A", "Theme B"],
  "merge_groups": [["Theme A", "Alternative label for A"]],
  "edges": [{ "parent": "Theme A", "child": "Theme B" }],
  "inferred_edges": []
}
```

Nodes that appear in the same `merge_groups` entry are collapsed into a single node (using the canonical label when present).
