import { isSupabaseConfigured } from "./supabaseClient";

export type DataSource = "local" | "supabase";

/** True when running from local pipeline files (no database). */
export function isLocalMode(): boolean {
  return getDataSource() === "local";
}

export function getDataSource(): DataSource {
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
