import { isSupabaseConfigured } from "./supabaseClient";

export type DataSource = "local" | "supabase";

declare global {
  interface Window {
    /** Injected by tools/viewer_launcher.py for pipeline static serving. */
    __GRAPH_BUILDER_VIEWER__?: { dataSource?: "local" | "supabase" | "files" };
  }
}

function runtimeDataSource(): DataSource | null {
  if (typeof window === "undefined") return null;
  const raw = window.__GRAPH_BUILDER_VIEWER__?.dataSource?.trim().toLowerCase();
  if (raw === "local" || raw === "files") return "local";
  if (raw === "supabase") return "supabase";
  return null;
}

/** True when running from local pipeline files (no database). */
export function isLocalMode(): boolean {
  return getDataSource() === "local";
}

export function getDataSource(): DataSource {
  const runtime = runtimeDataSource();
  if (runtime) return runtime;

  const raw = import.meta.env.VITE_DATA_SOURCE?.trim().toLowerCase();
  if (raw === "local" || raw === "files") return "local";
  if (raw === "supabase") return "supabase";
  // Auto: use Supabase when configured, otherwise local files.
  return isSupabaseConfigured() ? "supabase" : "local";
}

/** Whether Library / Codebook tabs can load data. */
export function isDataSourceConfigured(): boolean {
  return isLocalMode() || isSupabaseConfigured();
}
