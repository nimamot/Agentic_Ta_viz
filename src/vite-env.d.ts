/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: "local" | "supabase" | "files";
  readonly VITE_LOCAL_DATA_ROOT?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_TABLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
