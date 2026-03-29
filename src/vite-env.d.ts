/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Postgres table name (default: research_projects). */
  readonly VITE_SUPABASE_TABLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
