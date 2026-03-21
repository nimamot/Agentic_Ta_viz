export type ViewMode = "overview" | "focus";

export interface CodebookJson {
  canonical_nodes?: string[];
  merge_groups?: string[][];
  edges: { parent: string; child: string }[];
  inferred_edges?: { parent: string; child: string }[];
  node_frequencies?: Record<string, number>;
  code_provenance?: Record<string, string[]>;
}

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
  smooth?: Record<string, unknown>;
  width?: number;
  color?: Record<string, unknown>;
  dashes?: number[];
}
