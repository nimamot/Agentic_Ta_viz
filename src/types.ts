export type ViewMode = "overview" | "focus" | "hierarchy";

/** Row shape for the Supabase research / codebook table. */
export interface ResearchProjectRow {
  id: string;
  slug: string;
  research_question: string | null;
  codebook: unknown;
  global_graph: unknown;
  report_markdown: string;
  meta: unknown | null;
  created_at: string;
}

export interface CodebookJson {
  canonical_nodes?: string[];
  merge_groups?: string[][];
  edges: { parent: string; child: string }[];
  inferred_edges?: { parent: string; child: string }[];
  node_frequencies?: Record<string, number>;
  code_provenance?: Record<string, string[]>;
}

export type HierarchyRole = "theme" | "sub_theme" | "code";

export interface HierarchicalSubTheme {
  name: string;
  codes: string[];
}

export interface HierarchicalClusterEntry {
  label: string;
  sub_themes: HierarchicalSubTheme[];
  ungrouped_codes: string[];
}

/** Top-level keys are cluster indices (e.g. "0", "1"). */
export type HierarchicalCodebookJson = Record<string, HierarchicalClusterEntry>;

export interface GraphNode {
  id: number;
  label: string;
  title: string;
  aliases: string[];
  degree: number;
  inDegree: number;
  outDegree: number;
  componentId: number;
  componentSize: number;
  frequency: number;
  provenance: string[];
  /** Set when the graph was built from hierarchical theme JSON. */
  hierarchyRole?: HierarchyRole;
}

export interface GraphEdge {
  id: string;
  from: number;
  to: number;
  inferred: boolean;
}

export interface Adjacency {
  incoming: Map<number, Set<number>>;
  outgoing: Map<number, Set<number>>;
  undirected: Map<number, Set<number>>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<number, GraphNode>;
  nodeCount: number;
  edgeCount: number;
  adjacency: Adjacency;
}

export interface FocusSubgraph {
  nodes: VisNode[];
  edges: VisEdge[];
  nodeCount: number;
  edgeCount: number;
  depth: number;
}

export interface VisNode {
  id: number;
  label: string;
  title: string;
  size?: number;
  color?: Record<string, unknown>;
  font?: Record<string, unknown>;
  borderWidth?: number;
  shadow?: boolean | { enabled: boolean; color: string; size: number; x: number; y: number };
  mass?: number;
}

export interface VisEdge {
  id: string;
  from: number;
  to: number;
  arrows: string;
  /** `false` or `true` uses vis straight / default; object = curved options. */
  smooth?: Record<string, unknown> | boolean;
  width?: number;
  color?: Record<string, unknown>;
  dashes?: number[];
}
