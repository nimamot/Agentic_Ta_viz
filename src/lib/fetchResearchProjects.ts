import type { ResearchProjectRow } from "../types";
import { isLocalMode } from "./dataSource";
import { fetchLocalResearchProjects } from "./local/loadResearchProjects";
import { getSupabase, getSupabaseTableName } from "./supabaseClient";

export async function fetchResearchProjects(): Promise<ResearchProjectRow[]> {
  if (isLocalMode()) {
    return fetchLocalResearchProjects();
  }
  const sb = getSupabase();
  const table = getSupabaseTableName();
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ResearchProjectRow[];
}
