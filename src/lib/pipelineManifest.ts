/** Drives node + edge accent colors on the pipeline graph (role / runtime class, not exact model SKU). */
export type ModelKind =
  | "data_input"
  | "qwen_chat"
  | "validator"
  | "embedding_kmeans"
  | "mistral_chat";

export interface PipelineAvatar {
  type: "iconify";
  icon: string;
}

export interface PipelineNode {
  id: string;
  label: string;
  description: string;
  modelLabel: string;
  modelKind: ModelKind;
  skill: string | null;
  inputs: string[];
  outputs: string[];
  avatar: PipelineAvatar;
  avatarAlt: string;
  engineBadge: string;
}

export interface PipelineEdge {
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
}

export interface PipelineManifest {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  loopPairs: [string, string][];
}

export const pipelineManifest: PipelineManifest = {
  nodes: [
    {
      id: "ingest",
      label: "Corpus + RQ",
      description:
        "Tabular CSV with text_review (or review_text) column plus a RESEARCH_QUESTION environment variable. This is the raw input to the pipeline — no model runs here.",
      modelLabel: "None (data only)",
      modelKind: "data_input",
      skill: null,
      inputs: ["CSV corpus file", "RESEARCH_QUESTION env"],
      outputs: [],
      avatar: { type: "iconify", icon: "ph:tray-arrow-down-duotone" },
      avatarAlt: "Inbox dock bot",
      engineBadge: "Data input",
    },
    {
      id: "open_coding",
      label: "Open coding",
      description:
        "Per-row inductive coding from text. LangGraph may retry on parse failures. Produces a list of codes and a per-review markdown corpus.",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "qwen_chat",
      skill: "open_coding",
      inputs: ["CSV corpus", "RESEARCH_QUESTION"],
      outputs: ["gt_codes_only.json", "gt_open_codes_all_reviews.md"],
      avatar: { type: "iconify", icon: "ph:magnifying-glass-duotone" },
      avatarAlt: "Curious reader bot",
      engineBadge: "Qwen chat",
    },
    {
      id: "validate_open_codes",
      label: "Validate codes",
      description:
        "PASS / FAIL gate that checks code quality against the research question. On FAIL, feeds back into open coding for another attempt (up to max retries).",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "validator",
      skill: "validate_open_codes",
      inputs: ["gt_codes_only.json"],
      outputs: [],
      avatar: { type: "iconify", icon: "ph:shield-check-duotone" },
      avatarAlt: "Inspector bot",
      engineBadge: "Validator · Qwen",
    },
    {
      id: "axial",
      label: "Axial clustering",
      description:
        "Generates embeddings for all codes, then clusters them with KMeans. Produces a dedup map and codes_per_review groupings. No chat LLM is involved — only the embedding model and sklearn.",
      modelLabel: "Qwen3-Embedding-0.6B + sklearn KMeans",
      modelKind: "embedding_kmeans",
      skill: null,
      inputs: ["gt_codes_only.json"],
      outputs: ["gt_clustered_codes.json"],
      avatar: { type: "iconify", icon: "ph:graph-duotone" },
      avatarAlt: "Cluster engine bot",
      engineBadge: "Embedding model",
    },
    {
      id: "high_level",
      label: "High-level codebook",
      description:
        "Generates thematic labels for each cluster produced by axial coding. Builds the initial codebook structure.",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "qwen_chat",
      skill: "high_level_code_generation",
      inputs: ["gt_clustered_codes.json"],
      outputs: ["codebook.json"],
      avatar: { type: "iconify", icon: "ph:books-duotone" },
      avatarAlt: "Librarian bot",
      engineBadge: "Qwen chat",
    },
    {
      id: "refine",
      label: "Validate assignments",
      description:
        "Validator pass on code-to-cluster mappings: checks each assignment against the codebook and themes. If a code sits in the wrong cluster, it is reassigned to a better-fitting one before hierarchy work continues.",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "validator",
      skill: "refine_cluster_assignments",
      inputs: ["codebook.json", "gt_clustered_codes.json"],
      outputs: ["Updated cluster state"],
      avatar: { type: "iconify", icon: "ph:shield-check-duotone" },
      avatarAlt: "Inspector bot",
      engineBadge: "Validator · Qwen",
    },
    {
      id: "hierarchy",
      label: "Hierarchy construction",
      description:
        "Builds intra-cluster sub-themes — organizes codes within each cluster into a hierarchical structure.",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "qwen_chat",
      skill: "hierarchy_construction",
      inputs: ["codebook.json"],
      outputs: ["gt_hierarchy.json"],
      avatar: { type: "iconify", icon: "ph:tree-structure-duotone" },
      avatarAlt: "Tree bot",
      engineBadge: "Qwen chat",
    },
    {
      id: "meta_themes",
      label: "Meta-theme grouping",
      description:
        "Groups cluster-level labels into higher-order meta-themes for the final tree.",
      modelLabel: "Qwen3-30B-A3B-Instruct-2507-AWQ-4bit",
      modelKind: "qwen_chat",
      skill: "meta_theme_grouping",
      inputs: ["codebook.json"],
      outputs: ["gt_meta_themes.json"],
      avatar: { type: "iconify", icon: "ph:eye-duotone" },
      avatarAlt: "Director bot",
      engineBadge: "Qwen chat",
    },
    {
      id: "research_report",
      label: "Research report",
      description:
        "Generates a narrative research report from the global tree. Uses a separate SGLang instance running Mistral (overridable via REPORT_OPENAI_BASE / REPORT_MODEL_NAME env).",
      modelLabel: "Mistral-7B-Instruct-v0.3",
      modelKind: "mistral_chat",
      skill: "research_report",
      inputs: ["gt_global_graph.json"],
      outputs: ["research_report.md"],
      avatar: { type: "iconify", icon: "ph:pen-nib-duotone" },
      avatarAlt: "Writer bot",
      engineBadge: "Mistral chat",
    },
  ],

  edges: [
    { source: "ingest", target: "open_coding" },
    { source: "open_coding", target: "validate_open_codes", animated: true, label: "submit" },
    { source: "validate_open_codes", target: "open_coding", animated: true, label: "retry" },
    { source: "validate_open_codes", target: "axial", label: "PASS" },
    { source: "axial", target: "high_level" },
    { source: "high_level", target: "refine" },
    { source: "refine", target: "hierarchy" },
    { source: "hierarchy", target: "meta_themes" },
    { source: "meta_themes", target: "research_report" },
  ],

  loopPairs: [["open_coding", "validate_open_codes"]],
};

export const MODEL_KIND_COLORS: Record<ModelKind, string> = {
  /** Corpus + env — no model */
  data_input: "#8ab4f8",
  /** Qwen chat stages (coding, codebook, hierarchy, meta-themes) */
  qwen_chat: "#7cf0d0",
  /** PASS/FAIL and assignment checks — same hue for both validator nodes */
  validator: "#c4a5fd",
  /** Embeddings + KMeans — not a chat LLM */
  embedding_kmeans: "#ffb454",
  mistral_chat: "#ff7eb3",
};

export const MODEL_KIND_LABELS: Record<ModelKind, string> = {
  data_input: "Data input",
  qwen_chat: "Qwen chat",
  validator: "Validator (Qwen)",
  embedding_kmeans: "Embedding + KMeans",
  mistral_chat: "Mistral chat",
};
