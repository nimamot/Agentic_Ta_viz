export interface LocalManifest {
  /** Folder names under `projects/` (each folder is one Library project). */
  projects: string[];
  /** Folder names under `codebook-reviews/` (each folder is one pending review). */
  codebook_reviews: string[];
}

export interface LocalProjectMeta {
  id?: string;
  slug?: string;
  research_question?: string | null;
  created_at?: string;
}

export interface LocalReviewMeta {
  id?: string;
  slug?: string;
  research_question?: string | null;
  created_at?: string;
  updated_at?: string | null;
  status?: string;
}

export interface LocalSubmissionRecord {
  status: "approved" | "cancelled";
  submitted_at: string;
  codebook_v2?: unknown;
}
