# Thematic Codebook Graph

A React app that turns a thematic analysis codebook (JSON) into an interactive force-directed graph with overview/focus views, export, and keyboard shortcuts.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL shown (e.g. http://localhost:5173). To build for production:

```bash
npm run build
npm run preview
```

## Features

- **Overview / Focus tabs** – Full-graph map vs. 1- or 2-hop neighborhood around a selected node.
- **Node search** – Type a theme name and click **Focus** (or press Enter) to jump to focus view.
- **Details panel** – Selected node’s degree, parents, children, aliases, and cluster size.
- **Graph stats** – Nodes, edges, components, density, max degree, direct vs inferred edges (in the sidebar).
- **Export PNG** – Download the current graph view as an image.
- **Keyboard shortcuts**
  - `/` – Focus node search
  - `Esc` – Clear selection
  - `?` – Open help
  - `Ctrl+Enter` / `Cmd+Enter` – Build graph from JSON
- **URL state** – View mode and selected node are in the hash so you can bookmark or share a state.
- **Theme** – Light/dark toggle (persisted in `localStorage`).
- **Collapsible sidebar** – Arrow button to collapse the JSON panel for more graph space.
- **Help modal** – Shortcuts and tips (triggered by `?` or the **?** button).

## JSON format

Paste codebook JSON with:

- **canonical_nodes** (optional): list of main theme labels.
- **merge_groups** (optional): arrays of labels treated as the same theme (one node per group).
- **edges**: array of `{ "parent": "...", "child": "..." }`.
- **inferred_edges** (optional): same shape; drawn with dashed lines.

Example:

```json
{
  "canonical_nodes": ["Theme A", "Theme B"],
  "merge_groups": [["Theme A", "Alternative label for A"]],
  "edges": [{ "parent": "Theme A", "child": "Theme B" }],
  "inferred_edges": []
}
```

## Tech

- React 18, TypeScript, Vite
- [vis-network](https://visjs.github.io/vis-network/) for the force-directed graph
