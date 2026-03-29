import type { ResearchProjectRow } from "../types";
import { getSupabase, getSupabaseTableName } from "./supabaseClient";

export async function fetchResearchProjects(): Promise<ResearchProjectRow[]> {
  const sb = getSupabase();
  const table = getSupabaseTableName();
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ResearchProjectRow[];
}
