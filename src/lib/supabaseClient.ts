import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && String(url).trim() && String(key).trim());
}

export function getSupabaseTableName(): string {
  const t = import.meta.env.VITE_SUPABASE_TABLE;
  return (typeof t === "string" && t.trim() ? t.trim() : "research_projects");
}

export function getSupabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}
